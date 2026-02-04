//! Terminal/PTY commands
//!
//! This module provides Tauri commands for terminal operations including
//! spawning real PTY sessions, writing to terminals, resizing, and cleanup.
//! Uses the portable-pty crate for cross-platform PTY support.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;

use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, Mutex, RwLock};

/// Terminal info returned to frontend
#[derive(Debug, Clone, Serialize)]
pub struct TerminalInfo {
    pub id: String,
    pub cols: u16,
    pub rows: u16,
    pub cwd: String,
}

/// PTY output event emitted to frontend
#[derive(Debug, Clone, Serialize)]
pub struct PtyOutputEvent {
    pub terminal_id: String,
    pub data: String,
}

/// PTY exit event emitted to frontend
#[derive(Debug, Clone, Serialize)]
pub struct PtyExitEvent {
    pub terminal_id: String,
    pub exit_code: Option<i32>,
}

/// Represents an active PTY session
pub struct PtySession {
    pub info: TerminalInfo,
    pub writer: Box<dyn Write + Send>,
    pub shutdown_tx: mpsc::Sender<()>,
    pair: PtyPair,
}

impl PtySession {
    /// Resize the PTY
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.pair
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))
    }
}

/// Terminal state management - holds all active PTY sessions
pub struct TerminalState {
    sessions: RwLock<HashMap<String, Arc<Mutex<PtySession>>>>,
}

impl TerminalState {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    pub async fn add_session(&self, id: String, session: PtySession) {
        let mut sessions = self.sessions.write().await;
        sessions.insert(id, Arc::new(Mutex::new(session)));
    }

    pub async fn get_session(&self, id: &str) -> Option<Arc<Mutex<PtySession>>> {
        let sessions = self.sessions.read().await;
        sessions.get(id).cloned()
    }

    pub async fn remove_session(&self, id: &str) -> Option<Arc<Mutex<PtySession>>> {
        let mut sessions = self.sessions.write().await;
        sessions.remove(id)
    }

    pub async fn list_sessions(&self) -> Vec<TerminalInfo> {
        let sessions = self.sessions.read().await;
        let mut infos = Vec::new();
        for session in sessions.values() {
            let session = session.lock().await;
            infos.push(session.info.clone());
        }
        infos
    }
}

impl Default for TerminalState {
    fn default() -> Self {
        Self::new()
    }
}

/// Spawn a new terminal session with a real PTY
#[tauri::command]
pub async fn spawn_terminal(
    app: AppHandle,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<TerminalInfo, String> {
    let working_dir = cwd
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/")));

    let terminal_id = uuid::Uuid::new_v4().to_string();
    let cols = cols.unwrap_or(80);
    let rows = rows.unwrap_or(24);

    // Create the PTY system
    let pty_system = native_pty_system();

    // Create PTY with specified size
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Build the shell command
    let mut cmd = CommandBuilder::new(get_default_shell());
    cmd.cwd(&working_dir);

    // Set environment variables for proper terminal behavior
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    // Spawn the shell process
    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Get the writer for sending input to the PTY
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    // Get the reader for receiving output from the PTY
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

    // Create shutdown channel
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

    let terminal_info = TerminalInfo {
        id: terminal_id.clone(),
        cols,
        rows,
        cwd: working_dir.to_string_lossy().to_string(),
    };

    // Create the PTY session
    let session = PtySession {
        info: terminal_info.clone(),
        writer,
        shutdown_tx: shutdown_tx.clone(),
        pair,
    };

    // Get or create terminal state
    let terminal_state = app.try_state::<TerminalState>().ok_or_else(|| {
        "Terminal state not initialized. Make sure TerminalState is managed by Tauri.".to_string()
    })?;

    terminal_state
        .add_session(terminal_id.clone(), session)
        .await;

    // Spawn a task to read PTY output and emit events
    let app_handle = app.clone();
    let tid = terminal_id.clone();

    // Use a channel to communicate between the blocking reader thread and async task
    let (output_tx, mut output_rx) = mpsc::channel::<Vec<u8>>(100);

    // Spawn a blocking thread for reading from PTY (PTY reads are blocking)
    std::thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    // EOF - process exited
                    break;
                }
                Ok(n) => {
                    // Send data to async task
                    if output_tx.blocking_send(buffer[..n].to_vec()).is_err() {
                        // Receiver dropped, stop reading
                        break;
                    }
                }
                Err(e) => {
                    log::error!("PTY read error: {}", e);
                    break;
                }
            }
        }
        log::info!("PTY reader thread ended for terminal {}", tid);
    });

    // Async task to receive data and emit events
    let tid = terminal_id.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = shutdown_rx.recv() => {
                    log::info!("PTY async handler shutdown requested for terminal {}", tid);
                    break;
                }
                result = output_rx.recv() => {
                    match result {
                        Some(data) => {
                            // Got data, emit to frontend
                            let data_str = String::from_utf8_lossy(&data).to_string();
                            let event = PtyOutputEvent {
                                terminal_id: tid.clone(),
                                data: data_str,
                            };
                            if let Err(e) = app_handle.emit("pty-output", event) {
                                log::error!("Failed to emit PTY output: {}", e);
                            }
                        }
                        None => {
                            // Channel closed, reader thread ended
                            log::info!("PTY output channel closed for terminal {}", tid);
                            break;
                        }
                    }
                }
            }
        }

        // Wait for child process to exit and get exit code
        let exit_code = match child.wait() {
            Ok(status) => Some(status.exit_code() as i32),
            Err(e) => {
                log::error!("Failed to wait for child process: {}", e);
                None
            }
        };

        // Emit exit event
        let exit_event = PtyExitEvent {
            terminal_id: tid.clone(),
            exit_code,
        };
        if let Err(e) = app_handle.emit("pty-exit", exit_event) {
            log::error!("Failed to emit PTY exit event: {}", e);
        }

        log::info!("PTY async task ended for terminal {}", tid);
    });

    log::info!("Spawned terminal {} in {}", terminal_id, working_dir.display());

    Ok(terminal_info)
}

/// Write data to a terminal PTY
#[tauri::command]
pub async fn write_terminal(
    app: AppHandle,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    let terminal_state = app.try_state::<TerminalState>().ok_or_else(|| {
        "Terminal state not initialized".to_string()
    })?;

    let session = terminal_state
        .get_session(&terminal_id)
        .await
        .ok_or_else(|| format!("Terminal {} not found", terminal_id))?;

    let mut session = session.lock().await;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;
    session
        .writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {}", e))?;

    Ok(())
}

/// Resize a terminal PTY
#[tauri::command]
pub async fn resize_terminal(
    app: AppHandle,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let terminal_state = app.try_state::<TerminalState>().ok_or_else(|| {
        "Terminal state not initialized".to_string()
    })?;

    let session = terminal_state
        .get_session(&terminal_id)
        .await
        .ok_or_else(|| format!("Terminal {} not found", terminal_id))?;

    let mut session = session.lock().await;
    session.resize(cols, rows)?;
    session.info.cols = cols;
    session.info.rows = rows;

    log::debug!("Resized terminal {} to {}x{}", terminal_id, cols, rows);

    Ok(())
}

/// Close a terminal session
#[tauri::command]
pub async fn close_terminal(app: AppHandle, terminal_id: String) -> Result<(), String> {
    let terminal_state = app.try_state::<TerminalState>().ok_or_else(|| {
        "Terminal state not initialized".to_string()
    })?;

    if let Some(session) = terminal_state.remove_session(&terminal_id).await {
        let session = session.lock().await;
        // Signal shutdown to the reader task
        let _ = session.shutdown_tx.send(()).await;
        log::info!("Closed terminal {}", terminal_id);
    }

    Ok(())
}

/// Get list of active terminals
#[tauri::command]
pub async fn list_terminals(app: AppHandle) -> Result<Vec<TerminalInfo>, String> {
    let terminal_state = app.try_state::<TerminalState>().ok_or_else(|| {
        "Terminal state not initialized".to_string()
    })?;

    Ok(terminal_state.list_sessions().await)
}

/// Send a signal to a terminal (e.g., SIGINT for Ctrl+C)
#[tauri::command]
pub async fn send_terminal_signal(
    app: AppHandle,
    terminal_id: String,
    signal: String,
) -> Result<(), String> {
    // For SIGINT (Ctrl+C), we send the interrupt character
    // For other signals, we'd need platform-specific handling
    match signal.as_str() {
        "SIGINT" | "INT" => {
            // Send Ctrl+C (ASCII 0x03)
            write_terminal(app, terminal_id, "\x03".to_string()).await
        }
        "SIGQUIT" | "QUIT" => {
            // Send Ctrl+\ (ASCII 0x1C)
            write_terminal(app, terminal_id, "\x1c".to_string()).await
        }
        "SIGTSTP" | "TSTP" => {
            // Send Ctrl+Z (ASCII 0x1A)
            write_terminal(app, terminal_id, "\x1a".to_string()).await
        }
        "EOF" => {
            // Send Ctrl+D (ASCII 0x04)
            write_terminal(app, terminal_id, "\x04".to_string()).await
        }
        _ => Err(format!("Unknown signal: {}", signal)),
    }
}

/// Execute a command and return its output (non-PTY, for simple commands)
#[tauri::command]
pub async fn execute_command(
    cwd: Option<String>,
    command: String,
    args: Vec<String>,
) -> Result<CommandOutput, String> {
    use std::process::Command;

    let working_dir = cwd.unwrap_or_else(|| {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "/".to_string())
    });

    let output = Command::new(&command)
        .args(&args)
        .current_dir(&working_dir)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    Ok(CommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
        success: output.status.success(),
    })
}

#[derive(Debug, Serialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub success: bool,
}

/// Execute a shell command (runs through the shell)
#[tauri::command]
pub async fn execute_shell(cwd: Option<String>, command: String) -> Result<CommandOutput, String> {
    use std::process::Command;

    let working_dir = cwd.unwrap_or_else(|| {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "/".to_string())
    });

    #[cfg(target_os = "windows")]
    let output = Command::new("cmd")
        .args(["/C", &command])
        .current_dir(&working_dir)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("sh")
        .args(["-c", &command])
        .current_dir(&working_dir)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    Ok(CommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
        success: output.status.success(),
    })
}

/// Get the default shell for the current platform
fn get_default_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}
