export const APP_NAME = 'OMP GUI'

export const IPC_CHANNELS = {
  OMP_DETECT: 'omp:detect',
  OMP_CREATE_SESSION: 'omp:create-session',
  OMP_SEND_MESSAGE: 'omp:send-message',
  OMP_KILL_SESSION: 'omp:kill-session',
  OMP_SESSION_EVENT: 'omp:session-event',
  OMP_LIST_SESSIONS: 'omp:list-sessions',
  OMP_INSTALL: 'omp:install',
  OMP_INSTALL_STATUS: 'omp:install-status',
  FS_LIST_DIR: 'fs:list-dir',
  FS_READ_FILE: 'fs:read-file',
  FS_SET_ROOT: 'fs:set-root',
  MODULES_SCAN: 'modules:scan',
  MODULES_SET_ENABLED: 'modules:set-enabled',
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  DIALOG_SELECT_FOLDER: 'dialog:select-folder'
} as const

export const OMP_GLOBAL_DIR = '.omp'
export const PI_GLOBAL_DIR = '.pi'
