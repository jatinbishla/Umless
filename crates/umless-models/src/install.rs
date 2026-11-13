//! Downloading and unpacking model files.
//!
//! Downloads stream straight into the unpacker, so a 1 GB archive never sits on
//! disk twice. Everything lands in a `.partial-*` folder first and is renamed
//! into place only when complete, so an interrupted install never leaves a
//! half-written model that looks installed.

use std::fs;
use std::io::{self, Read};
use std::path::Path;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use indicatif::{ProgressBar, ProgressStyle};

use crate::Tier;

const SHERPA_ASR: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Format {
    /// A single file saved as `name`.
    File,
    /// A `.tar.bz2` whose top-level folder is `name`.
    TarBz2,
}

/// One downloadable thing a tier needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Artifact {
    /// File or folder name inside the models directory.
    pub name: String,
    pub url: String,
    format: Format,
    pub approx_mb: u32,
}

impl Artifact {
    pub(crate) fn silero_vad() -> Artifact {
        Artifact {
            name: "silero_vad.onnx".into(),
            url: format!("{SHERPA_ASR}/silero_vad.onnx"),
            format: Format::File,
            approx_mb: 2,
        }
    }

    /// A single GGUF file from a Hugging Face repo.
    pub(crate) fn hf_file(repo: &str, file: &str, approx_mb: u32) -> Artifact {
        Artifact {
            name: file.to_string(),
            url: format!("https://huggingface.co/{repo}/resolve/main/{file}"),
            format: Format::File,
            approx_mb,
        }
    }

    pub(crate) fn sherpa_asr(dir: &str, approx_mb: u32) -> Artifact {
        Artifact {
            name: dir.to_string(),
            url: format!("{SHERPA_ASR}/{dir}.tar.bz2"),
            format: Format::TarBz2,
            approx_mb,
        }
    }

    pub fn is_installed(&self, models: &Path) -> bool {
        match self.format {
            Format::File => models.join(&self.name).is_file(),
            Format::TarBz2 => models.join(&self.name).is_dir(),
        }
    }
}

/// How far an [`install_with`] download has got.
#[derive(Debug, Clone)]
pub struct Progress {
    /// The file being downloaded.
    pub name: String,
    /// Which file this is (1-based) of `files`.
    pub file: usize,
    pub files: usize,
    /// Bytes downloaded so far, over every file.
    pub done: u64,
    /// Expected bytes over every file: the server's sizes where known, estimates otherwise.
    pub total: u64,
}

/// Downloads every artifact the given tiers need that isn't already present, with a
/// progress bar on the terminal.
pub fn install(models: &Path, tiers: &[Tier]) -> Result<()> {
    run(models, tiers, None)
}

/// [`install`] for a window: no terminal bar; `progress` is called as bytes arrive, and
/// returning `false` from it cancels the download (the partial file is discarded, and
/// files already finished stay installed).
pub fn install_with(
    models: &Path,
    tiers: &[Tier],
    progress: &mut dyn FnMut(&Progress) -> bool,
) -> Result<()> {
    run(models, tiers, Some(progress))
}

/// The files the given tiers still need, and roughly how many MB they are.
pub fn missing(models: &Path, tiers: &[Tier]) -> (Vec<Artifact>, u32) {
    let mut todo: Vec<Artifact> = Vec::new();
    for tier in tiers {
        for a in tier.artifacts() {
            if !a.is_installed(models) && !todo.contains(&a) {
                todo.push(a);
            }
        }
    }
    let mb = todo.iter().map(|a| a.approx_mb).sum();
    (todo, mb)
}

fn run(
    models: &Path,
    tiers: &[Tier],
    mut progress: Option<&mut dyn FnMut(&Progress) -> bool>,
) -> Result<()> {
    fs::create_dir_all(models).with_context(|| format!("could not create {}", models.display()))?;
    let (todo, total) = missing(models, tiers);
    if todo.is_empty() {
        eprintln!("· everything for {} is already installed", names(tiers));
        return Ok(());
    }
    eprintln!(
        "· installing {} ({} files, ~{total} MB) into {}",
        names(tiers),
        todo.len(),
        models.display()
    );
    let mut state = Progress {
        name: String::new(),
        file: 0,
        files: todo.len(),
        done: 0,
        total: u64::from(total) * 1_000_000,
    };
    for (i, a) in todo.iter().enumerate() {
        state.name = a.name.clone();
        state.file = i + 1;
        let report = progress.as_deref_mut().map(|f| (&mut state, f));
        fetch(models, a, report).with_context(|| format!("could not install {}", a.name))?;
    }
    eprintln!("· done");
    Ok(())
}

fn names(tiers: &[Tier]) -> String {
    tiers
        .iter()
        .map(|t| t.name())
        .collect::<Vec<_>>()
        .join(", ")
}

type Report<'a, 'b> = Option<(&'a mut Progress, &'a mut (dyn FnMut(&Progress) -> bool + 'b))>;

fn fetch(models: &Path, a: &Artifact, report: Report) -> Result<()> {
    // Without a connect timeout one unreachable CDN address hangs forever; with one, ureq
    // splits it across the host's addresses and moves on to the next.
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(15)))
        .build()
        .into();
    let mut resp = agent
        .get(&a.url)
        .call()
        .with_context(|| format!("GET {}", a.url))?;
    let len = resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok());

    let body = resp.body_mut().as_reader();
    let reader: Box<dyn Read + '_> = match report {
        Some((state, f)) => {
            // Swap this file's estimate for its real size once the server says.
            if let Some(len) = len {
                state.total = state.total - u64::from(a.approx_mb) * 1_000_000 + len;
            }
            Box::new(Counting { inner: body, state, f })
        }
        None => Box::new(terminal_bar(a, len).wrap_read(body)),
    };

    let partial = models.join(format!(".partial-{}", a.name));
    if partial.exists() {
        remove(&partial)?;
    }
    let result = unpack(reader, a, models, &partial);
    if result.is_err() && partial.exists() {
        let _ = remove(&partial);
    }
    result
}

fn terminal_bar(a: &Artifact, len: Option<u64>) -> ProgressBar {
    let bar = ProgressBar::new(len.unwrap_or(a.approx_mb as u64 * 1_000_000));
    bar.set_style(
        ProgressStyle::with_template(
            "  {msg:<48} {bar:30} {bytes:>9}/{total_bytes:<9} {bytes_per_sec:>11} {eta:>4}",
        )
        .unwrap_or_else(|_| ProgressStyle::default_bar())
        .progress_chars("━╸ "),
    );
    bar.set_message(a.name.clone());
    bar
}

fn unpack(reader: impl Read, a: &Artifact, models: &Path, partial: &Path) -> Result<()> {
    match a.format {
        Format::File => {
            let mut out = fs::File::create(partial)?;
            copy(reader, &mut out)?;
            fs::rename(partial, models.join(&a.name))?;
        }
        Format::TarBz2 => {
            fs::create_dir_all(partial)?;
            // `unpack` refuses entries that would escape the target folder.
            tar::Archive::new(bzip2::read::BzDecoder::new(reader)).unpack(partial)?;
            let inner = partial.join(&a.name);
            if !inner.is_dir() {
                bail!("archive from {} has no top-level {}/ folder", a.url, a.name);
            }
            fs::rename(&inner, models.join(&a.name))?;
            fs::remove_dir_all(partial)?;
        }
    }
    Ok(())
}

/// Counts bytes for [`install_with`] and stops when its callback says so.
struct Counting<'a, 'b, R> {
    inner: R,
    state: &'a mut Progress,
    f: &'a mut (dyn FnMut(&Progress) -> bool + 'b),
}

impl<R: Read> Read for Counting<'_, '_, R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.state.done += n as u64;
        if !(self.f)(self.state) {
            return Err(io::Error::other("download cancelled"));
        }
        Ok(n)
    }
}

fn copy(mut r: impl Read, w: &mut impl io::Write) -> io::Result<u64> {
    io::copy(&mut r, w)
}

fn remove(p: &Path) -> io::Result<()> {
    if p.is_dir() {
        fs::remove_dir_all(p)
    } else {
        fs::remove_file(p)
    }
}
