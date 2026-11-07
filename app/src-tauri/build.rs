use std::process::Command;

/// Wynik polecenia git albo None (brak gita, katalog spoza repozytorium).
fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git")
        .args(args)
        .env("GIT_OPTIONAL_LOCKS", "0") // `git status` nie zapisuje indeksu, więc nie wywołuje ponownej kompilacji
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn main() {
    // Skrót commita, z którego powstał build: w oknie „O programie” stoi w nawiasie obok wersji.
    // Niezacommitowane zmiany w śledzonych plikach dopisują „-dirty”.
    if let Some(sha) = git(&["rev-parse", "--short=7", "HEAD"]) {
        let dirty =
            git(&["status", "--porcelain", "--untracked-files=no"]).is_some_and(|s| !s.is_empty());
        println!(
            "cargo:rustc-env=FLOWGRAPH_COMMIT={sha}{}",
            if dirty { "-dirty" } else { "" }
        );
        if let Some(dir) = git(&["rev-parse", "--absolute-git-dir"]) {
            println!("cargo:rerun-if-changed={dir}/HEAD");
            println!("cargo:rerun-if-changed={dir}/index");
            if let Some(r) = git(&["symbolic-ref", "-q", "HEAD"]) {
                println!("cargo:rerun-if-changed={dir}/{r}");
            }
        }
    }
    tauri_build::build()
}
