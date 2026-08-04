import { Language } from '../shared/types'
import { useAppStore } from './store'

const en = {
  // App
  'app.loading': 'Loading…',

  // Sidebar
  'sidebar.newChat': 'New Chat',
  'sidebar.cliMissing': 'omp/pi CLI not found. Install it to use chat.',
  'sidebar.selectProject': 'Select project folder',
  'sidebar.sessions': 'Sessions',
  'sidebar.noSessions': 'No sessions yet. Start a new chat.',
  'sidebar.rightPanel': 'Right Panel',
  'sidebar.chat': 'Chat',
  'sidebar.plugins': 'Plugins',
  'sidebar.language': 'Language',
  'sidebar.project': 'Project',
  'sidebar.theme': 'Toggle theme',
  'sidebar.settings': 'Settings',
  'sidebar.searchSessions': 'Search sessions…',
  'sidebar.noMatch': 'No sessions match your search.',

  // Chat panel
  'chat.noActiveSession': 'No active session',
  'chat.noProject': 'No project selected',
  'chat.modulesActive': '{count} plugins active',
  'chat.welcome.title': 'Start a conversation',
  'chat.welcome.body': 'Select a project folder and click "New Chat" to start coding with Oh My Pi.',
  'chat.hero.title': 'What shall we build today?',
  'chat.working': 'Working…',
  'chat.selectProject': 'Select project',
  'chat.suggest.explore': 'Explore and understand code',
  'chat.suggest.explore.prompt': 'Explore this project and explain its overall architecture and key modules to me.',
  'chat.suggest.build': 'Build a new feature',
  'chat.suggest.build.prompt': 'Help me design and implement a new feature for this project. Ask me what I want to build first.',
  'chat.suggest.review': 'Review code, suggest changes',
  'chat.suggest.review.prompt': 'Review the code in this project and suggest concrete improvements.',
  'chat.suggest.fix': 'Fix bugs and failures',
  'chat.suggest.fix.prompt': 'Find the most likely bugs in this project and propose fixes.',

  // Composer
  'composer.placeholder': 'Ask anything…  (Enter to send, Shift+Enter for newline)',
  'composer.placeholderDisabled': 'Install the omp/pi CLI to start chatting…',
  'composer.send': 'Send',
  'composer.stop': 'Stop generating',
  'composer.disclaimer': 'Oh My Pi can make mistakes. Review important code before running it.',

  // Message actions
  'msg.copy': 'Copy',
  'msg.copied': 'Copied',

  // Settings page
  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.language': 'Language',
  'settings.cliStatus': 'Status',
  'settings.cliAvailable': 'Available',
  'settings.cliMissing': 'Not found',
  'settings.cliPath': 'Path',
  'settings.redetect': 'Re-detect',
  'settings.detecting': 'Detecting…',
  'settings.data': 'Data',
  'settings.clearRecent': 'Recent projects',
  'settings.clear': 'Clear',
  'settings.cleared': 'Cleared',
  'settings.about': 'About',
  'settings.version': 'Version',
  'settings.cliSettingsFile': 'CLI settings file',
  'settings.showInFinder': 'Reveal in Finder',

  // Tool call card
  'tool.input': 'Input',
  'tool.output': 'Output',

  // Code block
  'code.copy': 'Copy',
  'code.copied': 'Copied',

  // Right panel
  'panel.files': 'Files',
  'panel.preview': 'Preview',
  'panel.selectProject': 'Select a project to browse files.',
  'panel.selectFile': 'Select a file from the file tree to preview.',
  'panel.loading': 'Loading…',
  'panel.cannotPreview': 'Cannot preview: {error}',

  // Plugins page
  'plugins.title': 'Plugins',
  'plugins.subtitle': 'Install, manage and use pi packages.',
  'plugins.refresh': 'Refresh',
  'plugins.installTitle': 'Install package',
  'plugins.installPlaceholder': 'npm:pkg · git:repo · https://… · /local/path',
  'plugins.install': 'Install',
  'plugins.installing': 'Installing…',
  'plugins.browseFolder': 'Folder',
  'plugins.browseFile': 'File',
  'plugins.installed': 'Installed',
  'plugins.empty': 'No packages installed yet.',
  'plugins.emptyHint': 'Browse pi.dev/packages, or search npm for the "pi-package" keyword.',
  'plugins.uninstall': 'Uninstall',
  'plugins.uninstallConfirm': 'Confirm?',
  'plugins.removing': 'Removing…',
  'plugins.update': 'Update',
  'plugins.updating': 'Updating…',
  'plugins.enabled': 'Enabled',
  'plugins.disabled': 'Disabled',
  'plugins.kind.local': 'Local',
  'plugins.usageTitle': 'How to use',
  'plugins.usage1': 'Packages load automatically in new chats — start a new chat after installing.',
  'plugins.usage2': 'Extensions add tools and commands to the agent; just ask in chat.',
  'plugins.usage3': 'Skills and prompts become slash commands (e.g. /skill:hello).',
  'plugins.actionLog': 'Log',
  'plugins.resource.extension': 'Extension',
  'plugins.resource.skill': 'Skill',
  'plugins.resource.prompt': 'Prompt',
  'plugins.resource.theme': 'Theme',
  'plugins.pinned': 'Pinned',

  // Setup wizard
  'setup.detecting': 'Detecting environment…',
  'setup.ready.title': 'Oh My Pi is ready',
  'setup.ready.subtitle': 'Launching main interface…',
  'setup.welcome.title': 'Welcome to OMP GUI',
  'setup.welcome.subtitle': 'A Codex-style desktop interface for Oh My Pi',
  'setup.missing': 'Oh My Pi (omp) was not found on this Mac. OMP GUI needs it to run the AI coding agent.',
  'setup.autoInstall': 'Auto-install Oh My Pi',
  'setup.installing': 'Installing…',
  'setup.installLog': 'Install log',
  'setup.installFailed': 'Installation failed',
  'setup.installComplete': 'Install complete.',
  'setup.orManual': 'or install manually',
  'setup.terminalCommand': 'Terminal command',
  'setup.copy': 'Copy',
  'setup.copied': 'Copied',
  'setup.installed': "I've installed it"
} as const

export type I18nKey = keyof typeof en

const zh: Record<I18nKey, string> = {
  'app.loading': '加载中…',

  'sidebar.newChat': '新建对话',
  'sidebar.cliMissing': '未找到 omp/pi CLI，安装后才能使用对话功能。',
  'sidebar.selectProject': '选择项目文件夹',
  'sidebar.sessions': '会话',
  'sidebar.noSessions': '还没有会话，点击新建对话开始。',
  'sidebar.rightPanel': '右侧面板',
  'sidebar.chat': '对话',
  'sidebar.plugins': '插件',
  'sidebar.language': '语言',
  'sidebar.project': '项目',
  'sidebar.theme': '切换主题',
  'sidebar.settings': '设置',
  'sidebar.searchSessions': '搜索会话…',
  'sidebar.noMatch': '没有匹配的会话。',

  'chat.noActiveSession': '没有活动会话',
  'chat.noProject': '未选择项目',
  'chat.modulesActive': '已启用 {count} 个插件',
  'chat.welcome.title': '开始一段对话',
  'chat.welcome.body': '选择项目文件夹，然后点击"新建对话"，让 Oh My Pi 帮你写代码。',
  'chat.hero.title': '今天想构建什么？',
  'chat.working': '正在工作…',
  'chat.selectProject': '选择项目',
  'chat.suggest.explore': '探索并理解代码',
  'chat.suggest.explore.prompt': '通读这个项目，向我解释它的整体架构和关键模块。',
  'chat.suggest.build': '构建新功能',
  'chat.suggest.build.prompt': '帮我为这个项目设计并实现一个新功能，先问我想做什么。',
  'chat.suggest.review': '审查代码并提出建议',
  'chat.suggest.review.prompt': '审查这个项目的代码，提出具体的改进建议。',
  'chat.suggest.fix': '修复问题和失败',
  'chat.suggest.fix.prompt': '找出这个项目里最可能出问题的地方，并给出修复方案。',

  'composer.placeholder': '想问什么？（Enter 发送，Shift+Enter 换行）',
  'composer.placeholderDisabled': '安装 omp/pi CLI 后开始对话…',
  'composer.send': '发送',
  'composer.stop': '停止生成',
  'composer.disclaimer': 'Oh My Pi 可能会犯错，重要代码运行前请人工检查。',

  // Message actions
  'msg.copy': '复制',
  'msg.copied': '已复制',

  // Settings page
  'settings.title': '设置',
  'settings.appearance': '外观',
  'settings.theme': '主题',
  'settings.themeLight': '浅色',
  'settings.themeDark': '深色',
  'settings.language': '语言',
  'settings.cliStatus': '状态',
  'settings.cliAvailable': '可用',
  'settings.cliMissing': '未找到',
  'settings.cliPath': '路径',
  'settings.redetect': '重新检测',
  'settings.detecting': '检测中…',
  'settings.data': '数据',
  'settings.clearRecent': '最近项目',
  'settings.clear': '清除',
  'settings.cleared': '已清除',
  'settings.about': '关于',
  'settings.version': '版本',
  'settings.cliSettingsFile': 'CLI 设置文件',
  'settings.showInFinder': '在 Finder 中显示',

  'tool.input': '输入',
  'tool.output': '输出',

  'code.copy': '复制',
  'code.copied': '已复制',

  'panel.files': '文件',
  'panel.preview': '预览',
  'panel.selectProject': '选择项目后可浏览文件。',
  'panel.selectFile': '从文件树中选择文件进行预览。',
  'panel.loading': '加载中…',
  'panel.cannotPreview': '无法预览：{error}',

  'plugins.title': '插件',
  'plugins.subtitle': '安装、管理和使用 pi 插件包。',
  'plugins.refresh': '刷新',
  'plugins.installTitle': '安装插件',
  'plugins.installPlaceholder': 'npm:包名 · git:仓库 · https://… · /本地路径',
  'plugins.install': '安装',
  'plugins.installing': '安装中…',
  'plugins.browseFolder': '选择文件夹',
  'plugins.browseFile': '选择文件',
  'plugins.installed': '已安装',
  'plugins.empty': '还没有安装任何插件。',
  'plugins.emptyHint': '可以去 pi.dev/packages 逛逛，或在 npm 搜索关键词 pi-package。',
  'plugins.uninstall': '卸载',
  'plugins.uninstallConfirm': '确认卸载？',
  'plugins.removing': '卸载中…',
  'plugins.update': '更新',
  'plugins.updating': '更新中…',
  'plugins.enabled': '已启用',
  'plugins.disabled': '已禁用',
  'plugins.kind.local': '本地',
  'plugins.usageTitle': '怎么用',
  'plugins.usage1': '插件会在新对话中自动加载，安装后新建一个对话即可生效。',
  'plugins.usage2': '扩展会为 AI 添加新工具，直接在对话里提需求即可使用。',
  'plugins.usage3': '技能和提示词会变成斜杠命令（如 /skill:hello）。',
  'plugins.actionLog': '日志',
  'plugins.resource.extension': '扩展',
  'plugins.resource.skill': '技能',
  'plugins.resource.prompt': '提示词',
  'plugins.resource.theme': '主题',
  'plugins.pinned': '已钉版',

  'setup.detecting': '正在检测环境…',
  'setup.ready.title': 'Oh My Pi 已就绪',
  'setup.ready.subtitle': '正在进入主界面…',
  'setup.welcome.title': '欢迎使用 OMP GUI',
  'setup.welcome.subtitle': 'Oh My Pi 的 Codex 风格桌面界面',
  'setup.missing': '在这台 Mac 上未找到 Oh My Pi（omp）。OMP GUI 需要它来运行 AI 编程助手。',
  'setup.autoInstall': '自动安装 Oh My Pi',
  'setup.installing': '安装中…',
  'setup.installLog': '安装日志',
  'setup.installFailed': '安装失败',
  'setup.installComplete': '安装完成。',
  'setup.orManual': '或手动安装',
  'setup.terminalCommand': '终端命令',
  'setup.copy': '复制',
  'setup.copied': '已复制',
  'setup.installed': '我已安装完成'
}

export const dictionaries: Record<Language, Record<I18nKey, string>> = { en, zh }

export function translate(
  language: Language,
  key: I18nKey,
  vars?: Record<string, string | number>
): string {
  let text = dictionaries[language][key] ?? dictionaries.en[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
  }
  return text
}

/** React hook: const t = useT(); t('sidebar.newChat') */
export function useT() {
  const language = useAppStore((s) => s.language)
  return (key: I18nKey, vars?: Record<string, string | number>) =>
    translate(language, key, vars)
}
