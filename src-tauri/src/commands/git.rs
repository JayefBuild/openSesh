//! Git commands
//!
//! This module provides Tauri commands for Git operations including
//! status, diff, log, stage, and commit.

use std::process::Command;
use serde::Serialize;

/// Git status result
#[derive(Debug, Serialize)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub staged: Vec<FileStatus>,
    pub unstaged: Vec<FileStatus>,
    pub untracked: Vec<String>,
    pub is_clean: bool,
    pub has_conflicts: bool,
}

#[derive(Debug, Serialize)]
pub struct FileStatus {
    pub path: String,
    pub status: String, // "modified", "added", "deleted", "renamed", "copied"
    pub old_path: Option<String>, // For renamed/copied files
}

/// Get git status for a repository
#[tauri::command]
pub async fn git_status(path: String) -> Result<GitStatus, String> {
    // Get branch info
    let branch_output = run_git_command(&path, &["branch", "--show-current"])?;
    let branch = branch_output.trim().to_string();

    // Get ahead/behind info
    let (ahead, behind) = get_ahead_behind(&path).unwrap_or((0, 0));

    // Get status with porcelain format for easy parsing
    let status_output = run_git_command(&path, &["status", "--porcelain=v1"])?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    let mut has_conflicts = false;

    for line in status_output.lines() {
        if line.len() < 3 {
            continue;
        }

        let index_status = line.chars().next().unwrap_or(' ');
        let worktree_status = line.chars().nth(1).unwrap_or(' ');
        let file_path = line[3..].to_string();

        // Check for conflicts
        if index_status == 'U' || worktree_status == 'U' {
            has_conflicts = true;
        }

        // Handle untracked files
        if index_status == '?' && worktree_status == '?' {
            untracked.push(file_path);
            continue;
        }

        // Handle staged changes
        if index_status != ' ' && index_status != '?' {
            let status = match index_status {
                'M' => "modified",
                'A' => "added",
                'D' => "deleted",
                'R' => "renamed",
                'C' => "copied",
                'U' => "conflict",
                _ => "unknown",
            };

            let (path, old_path) = if status == "renamed" || status == "copied" {
                // Parse "old -> new" format
                if let Some(arrow_pos) = file_path.find(" -> ") {
                    let old = file_path[..arrow_pos].to_string();
                    let new = file_path[arrow_pos + 4..].to_string();
                    (new, Some(old))
                } else {
                    (file_path.clone(), None)
                }
            } else {
                (file_path.clone(), None)
            };

            staged.push(FileStatus {
                path,
                status: status.to_string(),
                old_path,
            });
        }

        // Handle unstaged changes
        if worktree_status != ' ' && worktree_status != '?' {
            let status = match worktree_status {
                'M' => "modified",
                'D' => "deleted",
                'U' => "conflict",
                _ => "unknown",
            };

            unstaged.push(FileStatus {
                path: file_path,
                status: status.to_string(),
                old_path: None,
            });
        }
    }

    let is_clean = staged.is_empty() && unstaged.is_empty() && untracked.is_empty();

    Ok(GitStatus {
        branch,
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        is_clean,
        has_conflicts,
    })
}

/// Get ahead/behind counts relative to upstream
fn get_ahead_behind(path: &str) -> Result<(u32, u32), String> {
    let output = run_git_command(path, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])?;
    let parts: Vec<&str> = output.trim().split('\t').collect();

    if parts.len() == 2 {
        let ahead = parts[0].parse().unwrap_or(0);
        let behind = parts[1].parse().unwrap_or(0);
        Ok((ahead, behind))
    } else {
        Ok((0, 0))
    }
}

/// Get git diff
#[tauri::command]
pub async fn git_diff(path: String, staged: bool) -> Result<String, String> {
    let args = if staged {
        vec!["diff", "--cached"]
    } else {
        vec!["diff"]
    };

    run_git_command(&path, &args)
}

/// Get diff for a specific file
#[tauri::command]
pub async fn git_diff_file(path: String, file_path: String, staged: bool) -> Result<String, String> {
    let args = if staged {
        vec!["diff", "--cached", "--", &file_path]
    } else {
        vec!["diff", "--", &file_path]
    };

    run_git_command(&path, &args.iter().map(|s| s.as_ref()).collect::<Vec<&str>>())
}

/// Git commit info
#[derive(Debug, Serialize)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
    pub body: String,
}

/// Get git log
#[tauri::command]
pub async fn git_log(path: String, count: u32) -> Result<Vec<GitCommit>, String> {
    // Use a format that's easy to parse
    let format = "%H|%h|%an|%ae|%aI|%s|%b%x00";
    let count_str = count.to_string();
    let format_arg = format!("--format={}", format);
    let args = vec!["log", &format_arg, "-n", &count_str];

    let output = run_git_command(&path, &args)?;

    let mut commits = Vec::new();

    for entry in output.split('\0') {
        let entry = entry.trim();
        if entry.is_empty() {
            continue;
        }

        let parts: Vec<&str> = entry.splitn(7, '|').collect();
        if parts.len() >= 6 {
            commits.push(GitCommit {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                author: parts[2].to_string(),
                email: parts[3].to_string(),
                date: parts[4].to_string(),
                message: parts[5].to_string(),
                body: parts.get(6).unwrap_or(&"").to_string(),
            });
        }
    }

    Ok(commits)
}

/// Stage files for commit
#[tauri::command]
pub async fn git_stage(path: String, files: Vec<String>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }

    let mut args = vec!["add"];
    args.extend(files.iter().map(|s| s.as_str()));

    run_git_command(&path, &args)?;
    Ok(())
}

/// Unstage files
#[tauri::command]
pub async fn git_unstage(path: String, files: Vec<String>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }

    let mut args = vec!["reset", "HEAD", "--"];
    args.extend(files.iter().map(|s| s.as_str()));

    run_git_command(&path, &args)?;
    Ok(())
}

/// Stage all changes
#[tauri::command]
pub async fn git_stage_all(path: String) -> Result<(), String> {
    run_git_command(&path, &["add", "-A"])?;
    Ok(())
}

/// Commit staged changes
#[tauri::command]
pub async fn git_commit(path: String, message: String) -> Result<GitCommit, String> {
    // Create the commit
    run_git_command(&path, &["commit", "-m", &message])?;

    // Get the commit info
    let commits = git_log(path, 1).await?;
    commits
        .into_iter()
        .next()
        .ok_or_else(|| "Failed to get commit info".to_string())
}

/// Discard changes to a file
#[tauri::command]
pub async fn git_discard(path: String, file_path: String) -> Result<(), String> {
    run_git_command(&path, &["checkout", "--", &file_path])?;
    Ok(())
}

/// Get list of branches
#[tauri::command]
pub async fn git_branches(path: String) -> Result<Vec<GitBranch>, String> {
    let output = run_git_command(&path, &["branch", "-a", "-v", "--format=%(refname:short)|%(objectname:short)|%(upstream:short)|%(HEAD)"])?;

    let mut branches = Vec::new();

    for line in output.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 4 {
            branches.push(GitBranch {
                name: parts[0].to_string(),
                commit: parts[1].to_string(),
                upstream: if parts[2].is_empty() {
                    None
                } else {
                    Some(parts[2].to_string())
                },
                is_current: parts[3] == "*",
                is_remote: parts[0].starts_with("remotes/") || parts[0].starts_with("origin/"),
            });
        }
    }

    Ok(branches)
}

#[derive(Debug, Serialize)]
pub struct GitBranch {
    pub name: String,
    pub commit: String,
    pub upstream: Option<String>,
    pub is_current: bool,
    pub is_remote: bool,
}

/// Checkout a branch
#[tauri::command]
pub async fn git_checkout(path: String, branch: String) -> Result<(), String> {
    run_git_command(&path, &["checkout", &branch])?;
    Ok(())
}

/// Create a new branch
#[tauri::command]
pub async fn git_create_branch(path: String, name: String, checkout: bool) -> Result<(), String> {
    if checkout {
        run_git_command(&path, &["checkout", "-b", &name])?;
    } else {
        run_git_command(&path, &["branch", &name])?;
    }
    Ok(())
}

/// Pull changes
#[tauri::command]
pub async fn git_pull(path: String) -> Result<String, String> {
    run_git_command(&path, &["pull"])
}

/// Push changes
#[tauri::command]
pub async fn git_push(path: String, set_upstream: bool) -> Result<String, String> {
    if set_upstream {
        // Get current branch
        let branch = run_git_command(&path, &["branch", "--show-current"])?;
        let branch = branch.trim();
        run_git_command(&path, &["push", "-u", "origin", branch])
    } else {
        run_git_command(&path, &["push"])
    }
}

/// Fetch from remote
#[tauri::command]
pub async fn git_fetch(path: String) -> Result<String, String> {
    run_git_command(&path, &["fetch", "--all", "--prune"])
}

/// Check if a directory is a git repository
#[tauri::command]
pub async fn is_git_repository(path: String) -> Result<bool, String> {
    match run_git_command(&path, &["rev-parse", "--git-dir"]) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Initialize a git repository
#[tauri::command]
pub async fn git_init(path: String) -> Result<(), String> {
    run_git_command(&path, &["init"])?;
    Ok(())
}

/// Show file content at a specific ref (HEAD, commit hash, :0 for index, etc.)
#[tauri::command]
pub async fn git_show_file(path: String, file_path: String, git_ref: String) -> Result<String, String> {
    // Format: git show <ref>:<file_path>
    let spec = format!("{}:{}", git_ref, file_path);
    run_git_command(&path, &["show", &spec])
}

/// Run a git command and return the output
fn run_git_command(path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(path)
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if output.status.success() {
        String::from_utf8(output.stdout)
            .map_err(|e| format!("Invalid UTF-8 in git output: {}", e))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(stderr.to_string())
    }
}
