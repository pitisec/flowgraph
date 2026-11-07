// FlowGraph jako aplikacja: okno z edytorem (dist/index.html) i natywne dodatki,
// których przeglądarka nie daje: pełne ścieżki plików, zapis w miejscu, obserwowanie zmian na dysku,
// menu macOS z ostatnimi plikami i otwieranie plików z Findera.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{AboutMetadata, Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime, State};

/// Obserwator pliku otwartego w edytorze (zawsze najwyżej jeden).
struct Watch(Mutex<Option<RecommendedWatcher>>);
/// Pliki otwarte z Findera, zanim strona była gotowa je przyjąć.
struct Pending(Mutex<Vec<String>>);
/// Czy główne okno już się pokazało (pokazujemy je tylko raz).
struct Shown(AtomicBool);

/// Gdyby edytor nie zgłosił gotowości (błąd strony), główne okno i tak się pokaże.
const MAIN_MAX: Duration = Duration::from_secs(8);

/// Pokazuje główne okno (tylko raz). Ekran startowy zostaje nad nim, bo jest „zawsze na wierzchu”,
/// i sam się zamyka po skończonej animacji (splash.html).
fn show_main(app: &AppHandle) {
    if app.state::<Shown>().0.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/// Kończy aplikację po potwierdzeniu w edytorze (Cmd+Q, „Zakończ” w Docku).
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Edytor narysował pierwszy graf: główne okno może się pokazać.
#[tauri::command]
fn app_ready(app: AppHandle) {
    let h = app.clone();
    let _ = app.run_on_main_thread(move || show_main(&h));
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn write_text(path: String, text: String) -> Result<(), String> {
    std::fs::write(&path, text).map_err(|e| format!("{path}: {e}"))
}

/// Zapis binarny (PNG, JPG) przesyłany jako base64.
#[tauri::command]
fn write_base64(path: String, data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| format!("{path}: {e}"))
}

/// Obserwuje katalog pliku (edytory często zapisują przez zamianę pliku, więc sam plik by „znikał”)
/// i wysyła do strony zdarzenie file-changed, gdy zmieni się właśnie ten plik.
#[tauri::command]
fn watch_file(app: AppHandle, state: State<Watch>, path: Option<String>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    *slot = None;
    let Some(path) = path else { return Ok(()) };
    let target = PathBuf::from(&path);
    let dir = target
        .parent()
        .map(Path::to_path_buf)
        .ok_or("brak katalogu")?;
    let name = target.file_name().map(|n| n.to_os_string());
    let emit_path = path.clone();
    let mut w = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            let hit = ev
                .paths
                .iter()
                .any(|p| p.file_name().map(|n| n.to_os_string()) == name);
            if hit && (ev.kind.is_modify() || ev.kind.is_create()) {
                let _ = app.emit("file-changed", emit_path.clone());
            }
        }
    })
    .map_err(|e| e.to_string())?;
    w.watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    *slot = Some(w);
    Ok(())
}

/// Dziennik błędów strony: ~/Library/Logs/dev.flowgraph.editor/app.log (przydaje się przy zgłaszaniu problemów).
#[tauri::command]
fn log_line(app: AppHandle, line: String) -> Result<(), String> {
    use std::io::Write;
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("app.log"))
        .map_err(|e| e.to_string())?;
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    writeln!(f, "[{t}] {line}").map_err(|e| e.to_string())
}

/// FLOWGRAPH_SELFTEST=1 uruchamia autotest strony (wynik trafia do dziennika).
#[tauri::command]
fn selftest_enabled() -> bool {
    std::env::var("FLOWGRAPH_SELFTEST")
        .map(|v| v == "1")
        .unwrap_or(false)
}

/// Strona pyta o pliki otwarte z Findera przed jej załadowaniem.
#[tauri::command]
fn take_pending(state: State<Pending>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

/// Przebudowuje menu z aktualną listą ostatnich plików.
#[tauri::command]
fn set_recent(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    let menu = build_menu(&app, &paths).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, recent: &[String]) -> tauri::Result<Menu<R>> {
    let item = |id: &str, text: &str, acc: Option<&str>| {
        let b = MenuItemBuilder::with_id(id, text);
        match acc {
            Some(a) => b.accelerator(a),
            None => b,
        }
        .build(app)
    };

    let mut recent_menu = SubmenuBuilder::new(app, "Otwórz ostatnie");
    if recent.is_empty() {
        recent_menu = recent_menu.item(
            &MenuItemBuilder::with_id("recent-none", "Brak")
                .enabled(false)
                .build(app)?,
        );
    } else {
        for (i, p) in recent.iter().enumerate() {
            let label = Path::new(p)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| p.clone());
            let dir = Path::new(p)
                .parent()
                .map(|d| d.to_string_lossy().to_string())
                .unwrap_or_default();
            recent_menu = recent_menu.item(&item(
                &format!("recent:{i}"),
                &format!("{label}  —  {dir}"),
                None,
            )?);
        }
        recent_menu = recent_menu
            .separator()
            .item(&item("recent-clear", "Wyczyść listę", None)?);
    }

    // „O programie”: Version 0.4.0 (abc1234), w nawiasie commit, z którego powstał build (build.rs)
    let about = AboutMetadata {
        version: Some(env!("CARGO_PKG_VERSION").to_string()),
        short_version: option_env!("FLOWGRAPH_COMMIT").map(String::from),
        ..Default::default()
    };
    let app_menu = SubmenuBuilder::new(app, "FlowGraph")
        .about(Some(about))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        // własne „Zakończ” zamiast systemowego: edytor najpierw pyta o niezapisane zmiany (quit_app kończy)
        .item(&item("quit", "Zakończ FlowGraph", Some("CmdOrCtrl+Q"))?)
        .build()?;
    let file = SubmenuBuilder::new(app, "Plik")
        .item(&item("new", "Nowy", Some("CmdOrCtrl+N"))?)
        .item(&item("open", "Otwórz…", Some("CmdOrCtrl+O"))?)
        .item(&recent_menu.build()?)
        .item(&item("import-mermaid", "Importuj z Mermaid…", None)?)
        .separator()
        .item(&item("save", "Zapisz", Some("CmdOrCtrl+S"))?)
        .item(&item("save-as", "Zapisz jako…", Some("CmdOrCtrl+Shift+S"))?)
        .separator()
        .item(&item("close-tab", "Zamknij kartę", Some("CmdOrCtrl+W"))?)
        .separator()
        .item(&item(
            "export:html",
            "Eksportuj HTML…",
            Some("CmdOrCtrl+E"),
        )?)
        .item(&item("export:mermaid", "Mermaid…", None)?)
        .item(&item("export:png", "Eksportuj PNG…", None)?)
        .item(&item("export:svg", "Eksportuj SVG…", None)?)
        .item(&item("export:jpg", "Eksportuj JPG…", None)?)
        .build()?;
    // Cofnij/Ponów idą do strony: w polu tekstowym cofają pisanie, poza nim zmiany grafu.
    let edit = SubmenuBuilder::new(app, "Edycja")
        .item(&item("undo", "Cofnij", Some("CmdOrCtrl+Z"))?)
        .item(&item("redo", "Ponów", Some("CmdOrCtrl+Shift+Z"))?)
        .item(&item("history", "Historia zmian", Some("CmdOrCtrl+Y"))?)
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view = SubmenuBuilder::new(app, "Widok")
        .item(&item("view:left", "Struktura", Some("CmdOrCtrl+1"))?)
        .item(&item("view:yaml", "YAML", Some("CmdOrCtrl+2"))?)
        .item(&item("view:right", "Właściwości", Some("CmdOrCtrl+3"))?)
        .separator()
        .item(&item("zoom-in", "Powiększ", Some("CmdOrCtrl+="))?)
        .item(&item("zoom-out", "Pomniejsz", Some("CmdOrCtrl+-"))?)
        .item(&item("zoom-100", "Rzeczywisty rozmiar", None)?)
        .item(&item(
            "zoom-fit",
            "Dopasuj do szerokości",
            Some("CmdOrCtrl+0"),
        )?)
        .separator()
        .fullscreen()
        .build()?;
    // ⌘W zamyka kartę (Plik), więc okno zamyka ⌘⇧W
    let window = SubmenuBuilder::new(app, "Okno")
        .minimize()
        .maximize()
        .separator()
        .item(&item("tab-next", "Następna karta", Some("Ctrl+Tab"))?)
        .item(&item(
            "tab-prev",
            "Poprzednia karta",
            Some("Ctrl+Shift+Tab"),
        )?)
        .separator()
        .item(&item(
            "close-window",
            "Zamknij okno",
            Some("CmdOrCtrl+Shift+W"),
        )?)
        .build()?;
    Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window])
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Watch(Mutex::new(None)))
        .manage(Pending(Mutex::new(Vec::new())))
        .manage(Shown(AtomicBool::new(false)))
        .setup(|app| {
            let h = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(MAIN_MAX);
                let a = h.clone();
                let _ = h.run_on_main_thread(move || show_main(&a));
            });
            Ok(())
        })
        .menu(|app| build_menu(app, &[]))
        .on_menu_event(|app, ev| {
            let _ = app.emit("menu", ev.id().0.clone());
        })
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_text,
            write_base64,
            watch_file,
            take_pending,
            set_recent,
            log_line,
            selftest_enabled,
            app_ready,
            quit_app
        ])
        .build(tauri::generate_context!())
        .expect("nie udało się uruchomić FlowGraph");

    app.run(|app, event| {
        // Plik otwarty z Findera (dwuklik, „Otwórz za pomocą”, upuszczenie na ikonę w Docku)
        #[cfg(target_os = "macos")]
        if let RunEvent::Opened { urls } = &event {
            let paths: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().to_string())
                .collect();
            if let Some(state) = app.try_state::<Pending>() {
                state.0.lock().unwrap().extend(paths.iter().cloned());
            }
            let _ = app.emit("open-files", paths);
        }
        // Zakończenie spoza menu (np. „Zakończ” w Docku): gdy okno edytora jest otwarte, najpierw pyta edytor.
        // app.exit(0) z quit_app ma kod, więc przechodzi; zamknięcie ostatniego okna też (okna już nie ma).
        if let RunEvent::ExitRequested {
            code: None, api, ..
        } = &event
        {
            let open = app
                .get_webview_window("main")
                .is_some_and(|w| w.is_visible().unwrap_or(false));
            if open {
                api.prevent_exit();
                let _ = app.emit("menu", "quit");
            }
        }
        let _ = (app, event);
    });
}
