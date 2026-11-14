//! Linux: find sherpa-onnx's shared libraries (copied next to the binary by its build
//! script) through an `$ORIGIN` rpath. Its own `rustc-link-arg` only reaches its own crate.
//! Windows: embed the app icon (packaging/windows/umless.ico, from scripts/make-icons.sh)
//! and version strings in umless.exe.
fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=../../packaging/windows/umless.ico");
    let target = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target == "linux" {
        println!("cargo:rustc-link-arg-bins=-Wl,-rpath,$ORIGIN");
    }
    // Built on Windows for Windows (as CI and install.ps1 do). A failure only costs the icon.
    #[cfg(windows)]
    if target == "windows" {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("../../packaging/windows/umless.ico")
            .set("ProductName", "Umless")
            .set("FileDescription", "Umless")
            .set("CompanyName", "Umless")
            .set("LegalCopyright", "Apache-2.0");
        if let Err(e) = res.compile() {
            println!("cargo:warning=umless.exe has no icon: {e}");
        }
    }
}
