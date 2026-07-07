/// Windows Job Object management for process tree cleanup
///
/// Job Objects allow grouping processes so they can be terminated together,
/// preventing orphaned child processes when the parent is killed.

#[cfg(target_os = "windows")]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
    JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{HANDLE, CloseHandle, INVALID_HANDLE_VALUE};
#[cfg(target_os = "windows")]
use std::ffi::c_void;

/// Wrapper for Windows Job Object handle
#[cfg(target_os = "windows")]
pub struct JobObject {
    handle: HANDLE,
}

#[cfg(target_os = "windows")]
impl JobObject {
    /// Create a new Job Object with KILL_ON_JOB_CLOSE limit
    pub fn new() -> Result<Self, String> {
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle == INVALID_HANDLE_VALUE || handle == 0 {
                return Err("Failed to create Job Object".to_string());
            }

            let job = Self { handle };

            // Configure job to kill all processes when job handle is closed
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            let result = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );

            if result == 0 {
                CloseHandle(handle);
                return Err("Failed to configure Job Object".to_string());
            }

            Ok(job)
        }
    }

    /// Get the raw handle (for assigning processes)
    pub fn handle(&self) -> HANDLE {
        self.handle
    }

    /// Assign a process to this job
    pub fn assign_process(&self, process_handle: HANDLE) -> Result<(), String> {
        unsafe {
            let result = AssignProcessToJobObject(self.handle, process_handle);
            if result == 0 {
                Err("Failed to assign process to Job Object".to_string())
            } else {
                Ok(())
            }
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for JobObject {
    fn drop(&mut self) {
        unsafe {
            if self.handle != INVALID_HANDLE_VALUE && self.handle != 0 {
                CloseHandle(self.handle);
            }
        }
    }
}

// Non-Windows stubs
#[cfg(not(target_os = "windows"))]
pub struct JobObject;

#[cfg(not(target_os = "windows"))]
impl JobObject {
    pub fn new() -> Result<Self, String> {
        Ok(Self)
    }

    pub fn assign_process(&self, _process_handle: u32) -> Result<(), String> {
        Ok(())
    }
}
