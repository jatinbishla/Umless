//! Where Umless keeps the user's data and log on each OS, and how it opens files.
//!
//! - macOS: `~/Library/Application Support/Umless`, log in `~/Library/Logs/Umless.log`
//! - Windows: `%APPDATA%\Umless`, log in `%LOCALAPPDATA%\Umless\Umless.log`
//! - Linux: `$XDG_DATA_HOME/umless` (`~/.local/share/umless`), log in
//!   `$XDG_STATE_HOME/umless/umless.log` (`~/.local/state/umless/umless.log`)

use std::path::{Path, PathBuf};

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_default()
}

#[allow(dead_code)]
fn env_dir(var: &str) -> Option<PathBuf> {
    std::env::var_os(var)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

/// The folder for history, dictionary and settings.
pub fn data_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    return home().join("Library/Application Support/Umless");
    #[cfg(windows)]
    return env_dir("APPDATA")
        .unwrap_or_else(|| home().join("AppData/Roaming"))
        .join("Umless");
    #[cfg(not(any(target_os = "macos", windows)))]
    return env_dir("XDG_DATA_HOME")
        .unwrap_or_else(|| home().join(".local/share"))
        .join("umless");
}

/// The per-user models folder, for an installed Umless that has no `models/` of its own.
///
/// - macOS: `~/Library/Application Support/Umless/models`
/// - Windows: `%LOCALAPPDATA%\Umless\models` (not roaming: models are gigabytes)
/// - Linux: `$XDG_DATA_HOME/umless/models` (`~/.local/share/umless/models`)
pub fn user_models_dir() -> PathBuf {
    #[cfg(windows)]
    return env_dir("LOCALAPPDATA")
        .unwrap_or_else(|| home().join("AppData/Local"))
        .join("Umless/models");
    #[cfg(not(windows))]
    return data_dir().join("models");
}

/// The models folder when neither `--models` nor `UMLESS_MODELS` names one: `./models` if it
/// has any models in it, or if this binary is a cargo build (`target/release/umless` in a
/// source checkout, where `umless models install` fills `./models` as it always has);
/// otherwise [`user_models_dir`], which is what downloaded installers use.
pub fn default_models_dir() -> PathBuf {
    let local = PathBuf::from("models");
    let has_models = umless_models::Tier::ALL
        .iter()
        .flat_map(|t| t.artifacts())
        .any(|a| a.is_installed(&local));
    if has_models || is_cargo_build() {
        local
    } else {
        user_models_dir()
    }
}

/// Whether the running binary sits in a cargo `target/<profile>/` folder.
fn is_cargo_build() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let dirs: Vec<_> = exe
        .parent()
        .into_iter()
        .flat_map(Path::ancestors)
        .take(3)
        .filter_map(|p| p.file_name())
        .collect();
    // target/release/umless, target/debug/umless, target/<triple>/release/umless
    dirs.iter().any(|d| *d == "target")
        && dirs
            .first()
            .is_some_and(|d| *d == "release" || *d == "debug")
}

/// Umless's log file, written when it runs without a terminal.
pub fn log_path() -> PathBuf {
    #[cfg(target_os = "macos")]
    return home().join("Library/Logs/Umless.log");
    #[cfg(windows)]
    return env_dir("LOCALAPPDATA")
        .unwrap_or_else(|| home().join("AppData/Local"))
        .join("Umless/Umless.log");
    #[cfg(not(any(target_os = "macos", windows)))]
    return env_dir("XDG_STATE_HOME")
        .unwrap_or_else(|| home().join(".local/state"))
        .join("umless/umless.log");
}

/// How to open a path.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Open {
    /// In the user's text editor.
    Edit,
    /// Show it in the file manager.
    Reveal,
    /// A URL or anything with a default handler.
    Default,
}

/// Opens `path` the way the OS does when you double-click it.
pub fn open(path: &Path, how: Open) -> std::io::Result<()> {
    use std::process::Command;
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        match how {
            Open::Edit => c.arg("-t"),
            Open::Reveal => c.arg("-R"),
            Open::Default => &mut c,
        };
        c.arg(path);
        c
    };
    #[cfg(windows)]
    let mut cmd = match how {
        Open::Edit => {
            let mut c = Command::new("notepad.exe");
            c.arg(path);
            c
        }
        Open::Reveal => {
            let mut c = Command::new("explorer.exe");
            c.arg(format!("/select,{}", path.display()));
            c
        }
        Open::Default => {
            let mut c = Command::new("explorer.exe");
            c.arg(path);
            c
        }
    };
    #[cfg(not(any(target_os = "macos", windows)))]
    let mut cmd = {
        // xdg-open has no "reveal": open the folder instead.
        let target = match how {
            Open::Reveal => path.parent().unwrap_or(path),
            _ => path,
        };
        let mut c = Command::new("xdg-open");
        c.arg(target);
        c
    };
    cmd.spawn().map(|_| ())
}
