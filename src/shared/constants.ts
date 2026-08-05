export const APP_NAME = 'OMP GUI'

export const IPC_CHANNELS = {
  OMP_DETECT: 'omp:detect',
  OMP_CREATE_SESSION: 'omp:create-session',
  OMP_SEND_MESSAGE: 'omp:send-message',
  OMP_KILL_SESSION: 'omp:kill-session',
  OMP_ABORT_SESSION: 'omp:abort-session',
  OMP_SESSION_EVENT: 'omp:session-event',
  OMP_LIST_SESSIONS: 'omp:list-sessions',
  OMP_INSTALL: 'omp:install',
  OMP_INSTALL_STATUS: 'omp:install-status',
  FS_LIST_DIR: 'fs:list-dir',
  FS_READ_FILE: 'fs:read-file',
  FS_SET_ROOT: 'fs:set-root',
  PACKAGES_LIST: 'packages:list',
  PACKAGES_SEARCH: 'packages:search',
  PACKAGES_INSTALL: 'packages:install',
  PACKAGES_REMOVE: 'packages:remove',
  PACKAGES_UPDATE: 'packages:update',
  PACKAGES_SET_ENABLED: 'packages:set-enabled',
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  DIALOG_SELECT_FOLDER: 'dialog:select-folder',
  DIALOG_SELECT_FILE: 'dialog:select-file',
  SHELL_SHOW_CLI_SETTINGS: 'shell:show-cli-settings',
  OMP_RESPOND_UI: 'omp:respond-ui',
  OMP_SET_MODEL: 'omp:set-model',
  OMP_SESSION_STATS: 'omp:session-stats',
  OMP_LIST_COMMANDS: 'omp:list-commands',
  OMP_COMPACT: 'omp:compact',
  PI_GET_MODEL_CONFIG: 'pi:get-model-config',
  PI_SET_MODEL_CONFIG: 'pi:set-model-config',
  PI_SET_API_KEY: 'pi:set-api-key',
  PI_CLEAR_API_KEY: 'pi:clear-api-key',
  PI_LIST_MODELS: 'pi:list-models',
  PI_LIST_CATALOG_MODELS: 'pi:list-catalog-models',
  PI_SET_MACHINE_SKILLS: 'pi:set-machine-skills',
  APP_VERSION: 'app:version'
} as const

export const OMP_GLOBAL_DIR = '.omp'
export const PI_GLOBAL_DIR = '.pi'
