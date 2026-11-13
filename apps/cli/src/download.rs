//! Downloading a tier from the Umless window: the first-run model picker and the Settings
//! page's "not downloaded" tiers. The download itself is `umless models install`'s code
//! (`umless_models::install_with`), run on a thread; the page polls [`Downloads::status`].

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use anyhow::{Result, bail};
use serde_json::{Value, json};
use umless_models::Tier;

use crate::settings::Settings;

#[derive(Clone, Default)]
pub struct Downloads {
    state: Arc<Mutex<State>>,
    cancel: Arc<AtomicBool>,
}

#[derive(Clone, Default)]
enum State {
    #[default]
    Idle,
    Running {
        tier: Tier,
        progress: Option<umless_models::Progress>,
    },
    Done(Tier),
    Failed {
        tier: Tier,
        error: String,
    },
    Cancelled(Tier),
}

impl Downloads {
    /// Starts downloading `tier` into `models` unless a download is already running. When
    /// it finishes, `tier` becomes the user's tier (the window then restarts Umless).
    pub fn start(&self, models: PathBuf, tier: Tier, settings: Settings) -> Result<()> {
        {
            let mut state = self.state.lock().unwrap();
            if let State::Running { tier: t, .. } = &*state {
                bail!("already downloading {t}");
            }
            *state = State::Running {
                tier,
                progress: None,
            };
        }
        self.cancel.store(false, Ordering::Relaxed);
        let (state, cancel) = (self.state.clone(), self.cancel.clone());
        std::thread::Builder::new()
            .name("umless-download".into())
            .spawn(move || {
                let result = umless_models::install_with(&models, &[tier], &mut |p| {
                    if let State::Running { progress, .. } = &mut *state.lock().unwrap() {
                        *progress = Some(p.clone());
                    }
                    !cancel.load(Ordering::Relaxed)
                });
                let next = match result {
                    Ok(()) => match settings.set_tier(tier) {
                        Ok(()) => State::Done(tier),
                        Err(e) => State::Failed {
                            tier,
                            error: format!("downloaded, but could not save the tier: {e:#}"),
                        },
                    },
                    Err(_) if cancel.load(Ordering::Relaxed) => State::Cancelled(tier),
                    Err(e) => State::Failed {
                        tier,
                        error: format!("{e:#}"),
                    },
                };
                match &next {
                    State::Done(t) => eprintln!("· downloaded the {t} tier"),
                    State::Cancelled(t) => eprintln!("· {t} download cancelled"),
                    State::Failed { tier, error } => eprintln!("· {tier} download failed: {error}"),
                    _ => {}
                }
                *state.lock().unwrap() = next;
            })?;
        Ok(())
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::Relaxed);
    }

    /// The download as the page shows it.
    pub fn status(&self) -> Value {
        match &*self.state.lock().unwrap() {
            State::Idle => json!({ "state": "idle" }),
            State::Running { tier, progress } => {
                let p = progress.as_ref();
                json!({
                    "state": "running",
                    "tier": tier.name(),
                    "file": p.map(|p| p.name.clone()),
                    "index": p.map_or(0, |p| p.file),
                    "files": p.map_or(0, |p| p.files),
                    "done": p.map_or(0, |p| p.done),
                    "total": p.map_or(u64::from(tier.download_mb()) * 1_000_000, |p| p.total),
                })
            }
            State::Done(tier) => json!({ "state": "done", "tier": tier.name() }),
            State::Failed { tier, error } => {
                json!({ "state": "failed", "tier": tier.name(), "error": error })
            }
            State::Cancelled(tier) => json!({ "state": "cancelled", "tier": tier.name() }),
        }
    }
}

/// What each tier is for, as install.sh describes them.
pub fn blurb(tier: Tier) -> &'static str {
    match tier {
        Tier::Lite => "Fastest, runs on any laptop. English.",
        Tier::Standard => "The best balance. 25 European languages.",
        Tier::Max => {
            "Most accurate, 99 languages including Hindi. Needs Apple Silicon or a fast GPU to feel instant."
        }
    }
}

/// This machine's memory in GB, for the tier suggestion (as install.sh makes it).
pub fn ram_gb() -> f64 {
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    #[cfg(target_os = "macos")]
    {
        let mut bytes: u64 = 0;
        let mut len = std::mem::size_of::<u64>();
        // SAFETY: hw.memsize is a u64; the buffer and its length match.
        let ok = unsafe {
            libc::sysctlbyname(
                c"hw.memsize".as_ptr(),
                (&raw mut bytes).cast(),
                &mut len,
                std::ptr::null_mut(),
                0,
            )
        } == 0;
        if ok {
            return bytes as f64 / GB;
        }
    }
    #[cfg(target_os = "linux")]
    if let Some(kb) = std::fs::read_to_string("/proc/meminfo").ok().and_then(|m| {
        m.lines()
            .find(|l| l.starts_with("MemTotal:"))
            .and_then(|l| l.split_whitespace().nth(1)?.parse::<f64>().ok())
    }) {
        return kb * 1024.0 / GB;
    }
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::SystemInformation::{
            GlobalMemoryStatusEx, MEMORYSTATUSEX,
        };
        // SAFETY: a zeroed struct with its length set, as the API requires.
        let mut m: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
        m.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if unsafe { GlobalMemoryStatusEx(&mut m) } != 0 {
            return m.ullTotalPhys as f64 / GB;
        }
    }
    8.0
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The window's download path for real: starts Lite into an empty folder, waits for the
    /// first bytes, cancels, and checks nothing half-written is left. Needs the network:
    /// `cargo test --release -p umless-cli -- --ignored download`.
    #[test]
    #[ignore]
    fn download_starts_and_cancels() {
        let dir = std::env::temp_dir().join(format!("umless-dl-{}", std::process::id()));
        let d = Downloads::default();
        d.start(dir.clone(), Tier::Lite, Settings::load()).unwrap();
        assert!(d.start(dir.clone(), Tier::Lite, Settings::load()).is_err());
        let wait = |want: &str| {
            for _ in 0..600 {
                let s = d.status();
                if s["state"] == want && (want != "running" || s["done"].as_u64() > Some(0)) {
                    return s;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            panic!("never reached {want}: {}", d.status());
        };
        let running = wait("running");
        eprintln!("{running}");
        assert_eq!(running["files"], 3);
        d.cancel();
        wait("cancelled");
        let left: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with(".partial-"))
            .collect();
        assert!(left.is_empty(), "partial files left: {left:?}");
        assert!(!Tier::Lite.is_installed(&dir));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
