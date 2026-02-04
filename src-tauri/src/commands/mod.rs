//! Tauri IPC commands
//!
//! This module contains all the commands that can be called from the frontend
//! via Tauri's IPC mechanism.

pub mod chat;
pub mod files;
pub mod git;
pub mod terminal;

pub use chat::*;
pub use files::*;
pub use git::*;
pub use terminal::*;
