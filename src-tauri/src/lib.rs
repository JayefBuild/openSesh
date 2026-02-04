//! Open Sesh - Model-agnostic AI Coding Workbench
//!
//! This is the main library for the Tauri backend, providing AI provider integrations,
//! file operations, git integration, and terminal support.

pub mod commands;
pub mod providers;
pub mod state;
pub mod tools;

use std::sync::Arc;
use state::AppState;
use commands::terminal::TerminalState;

/// Initialize the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    if let Err(e) = dotenvy::dotenv() {
        eprintln!("Warning: Could not load .env file: {}", e);
    }

    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    log::info!("Starting Open Sesh...");

    // Create application state
    let app_state = Arc::new(AppState::new());

    // Create terminal state for PTY session management
    let terminal_state = TerminalState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state.clone())
        .manage(terminal_state)
        .setup(move |_app| {
            // Initialize providers asynchronously
            let state = app_state.clone();
            tauri::async_runtime::spawn(async move {
                state.init_providers().await;
            });

            log::info!("Open Sesh initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Chat commands
            commands::chat::send_message,
            commands::chat::send_message_stream,
            commands::chat::execute_tool_calls,
            commands::chat::get_providers,
            commands::chat::set_active_provider,
            commands::chat::set_provider_model,
            // File commands
            commands::files::read_file,
            commands::files::read_file_lines,
            commands::files::write_file,
            commands::files::list_directory,
            commands::files::list_directory_recursive,
            commands::files::search_files,
            commands::files::grep_files,
            commands::files::grep_files_with_context,
            commands::files::path_exists,
            commands::files::is_file,
            commands::files::is_directory,
            commands::files::get_file_info,
            commands::files::create_directory,
            commands::files::delete_file,
            commands::files::copy_file,
            commands::files::move_file,
            commands::files::set_project_path,
            commands::files::get_project_path,
            commands::files::select_directory,
            // Git commands
            commands::git::git_status,
            commands::git::git_diff,
            commands::git::git_diff_file,
            commands::git::git_log,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_stage_all,
            commands::git::git_commit,
            commands::git::git_discard,
            commands::git::git_branches,
            commands::git::git_checkout,
            commands::git::git_create_branch,
            commands::git::git_pull,
            commands::git::git_push,
            commands::git::git_fetch,
            commands::git::is_git_repository,
            commands::git::git_init,
            commands::git::git_show_file,
            // Terminal commands
            commands::terminal::spawn_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::close_terminal,
            commands::terminal::list_terminals,
            commands::terminal::send_terminal_signal,
            commands::terminal::execute_command,
            commands::terminal::execute_shell,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
