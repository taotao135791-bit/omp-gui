import { useState } from 'react'
import { Check, KeyRound, Loader2, LogOut, RefreshCw, X } from 'lucide-react'
import { LoginState } from '@shared/types'
import { useAppStore } from '../store'
import { useT } from '../i18n'

/**
 * Settings → Authentication (current profile). The provider list and every
 * status come straight from the runtime (get_login_providers); Connect runs
 * the runtime's native login flow (browser / key prompt, provider-validated);
 * Sign out removes the credential through the official CLI with
 * read-after-write verification. No key is ever stored by the GUI.
 */
export default function AuthSection() {
  const overview = useAppStore((s) => s.runtimeOverview)
  const loginState = useAppStore((s) => s.loginState)
  const loadRuntimeOverview = useAppStore((s) => s.loadRuntimeOverview)
  const startLogin = useAppStore((s) => s.startLogin)
  const answerLogin = useAppStore((s) => s.answerLogin)
  const cancelLogin = useAppStore((s) => s.cancelLogin)
  const logoutProvider = useAppStore((s) => s.logoutProvider)
  const [refreshing, setRefreshing] = useState(false)
  const [logoutTarget, setLogoutTarget] = useState<string | null>(null)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const t = useT()

  const capabilities = overview?.capabilities
  const providers = overview?.providers ?? []
  const sorted = [...providers].sort(
    (a, b) => Number(b.authenticated) - Number(a.authenticated) || a.name.localeCompare(b.name)
  )
  const flowActive = loginState.status !== 'idle'
  const flowRunning =
    loginState.status === 'starting' ||
    loginState.status === 'verifying' ||
    loginState.status === 'waiting_for_browser' ||
    loginState.status === 'waiting_for_input' ||
    loginState.status === 'waiting_for_select' ||
    loginState.status === 'waiting_for_confirm'
  const flowProvider = 'providerId' in loginState ? loginState.providerId : ''
  const [startError, setStartError] = useState<string | null>(null)

  const refresh = async () => {
    setRefreshing(true)
    await loadRuntimeOverview(true)
    setRefreshing(false)
  }

  const connect = async (providerId: string) => {
    setStartError(null)
    const r = await startLogin(providerId)
    if (!r.ok) setStartError(r.error ?? 'failed')
  }

  const signOut = async (providerId: string) => {
    setLogoutError(null)
    setLogoutTarget(providerId)
    const r = await logoutProvider(providerId)
    setLogoutTarget(null)
    if (!r.ok) setLogoutError(r.error ?? 'failed')
  }

  const submitInput = () => {
    if (!inputValue.trim()) return
    void answerLogin({ value: inputValue.trim() })
    setInputValue('')
  }

  const buttonCls =
    'flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[12px] text-cream-dim transition-colors hover:border-ink-600 hover:text-cream disabled:opacity-40'

  return (
    <section className="overflow-hidden rounded-[16px] border border-line bg-ink-850 shadow-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-faint">
          {t('settings.auth')}
        </span>
        <button onClick={refresh} disabled={refreshing} className={buttonCls} title={t('settings.authRefresh')}>
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
          {t('settings.authRefresh')}
        </button>
      </div>

      <div className="px-4 py-3">
        {!overview && <p className="text-xs text-cream-faint">{t('settings.authLoading')}</p>}
        {overview && capabilities?.providers === 'unsupported' && (
          <p className="text-xs text-cream-faint">{t('settings.authRuntimeDown')}</p>
        )}
        {overview && capabilities?.providers !== 'unsupported' && sorted.length === 0 && (
          <p className="text-xs text-cream-faint">{t('settings.authEmpty')}</p>
        )}

        {sorted.length > 0 && (
          <ul className="divide-y divide-line/60">
            {sorted.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      p.authenticated ? 'bg-emerald-500' : 'bg-cream-faint/40'
                    }`}
                  />
                  <span className="truncate text-[13px] text-cream">{p.name}</span>
                  <span className="shrink-0 text-xs text-cream-faint">
                    {p.authenticated ? t('settings.authConnected') : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {p.authenticated ? (
                    <button
                      onClick={() => signOut(p.id)}
                      disabled={logoutTarget === p.id || flowRunning}
                      className={buttonCls}
                    >
                      {logoutTarget === p.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <LogOut size={11} />
                      )}
                      {t('settings.authSignOut')}
                    </button>
                  ) : (
                    <button
                      onClick={() => connect(p.id)}
                      disabled={flowRunning || capabilities?.nativeLogin !== 'supported'}
                      className={buttonCls}
                    >
                      <KeyRound size={11} />
                      {t('settings.authConnect')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {logoutError && (
          <p className="mt-2 text-xs text-red-500">
            {logoutError}
            {/environment/i.test(logoutError) ? '' : ''}
          </p>
        )}
        {startError && <p className="mt-2 text-xs text-red-500">{startError}</p>}

        {flowActive && (
          <LoginFlowCard
            state={loginState}
            providerName={providers.find((p) => p.id === flowProvider)?.name ?? flowProvider}
            inputValue={inputValue}
            setInputValue={setInputValue}
            onSubmitInput={submitInput}
            onSelect={(value) => void answerLogin({ value })}
            onConfirm={(confirmed) => void answerLogin({ confirmed })}
            onCancel={() => {
              if (flowRunning) void cancelLogin()
              else useAppStore.setState({ loginState: { status: 'idle' } })
            }}
          />
        )}

        <p className="mt-3 border-t border-line/60 pt-2.5 text-[11px] leading-relaxed text-cream-faint">
          {t('settings.authNote')}
        </p>
      </div>
    </section>
  )
}

/** Inline login progress/prompt card, driven entirely by LoginState. */
function LoginFlowCard({
  state,
  providerName,
  inputValue,
  setInputValue,
  onSubmitInput,
  onSelect,
  onConfirm,
  onCancel
}: {
  state: LoginState
  providerName: string
  inputValue: string
  setInputValue: (v: string) => void
  onSubmitInput: () => void
  onSelect: (value: string) => void
  onConfirm: (confirmed: boolean) => void
  onCancel: () => void
}) {
  const t = useT()
  const busy =
    state.status === 'starting' ||
    state.status === 'verifying' ||
    state.status === 'waiting_for_browser'

  return (
    <div className="mt-3 rounded-[12px] border border-line bg-ink-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[12.5px] font-medium text-cream">
          {busy && <Loader2 size={12} className="animate-spin text-cream-dim" />}
          {state.status === 'connected' && <Check size={12} className="text-emerald-500" />}
          {state.status === 'failed' && <X size={12} className="text-red-500" />}
          {providerName}
        </span>
        {state.status !== 'connected' && state.status !== 'failed' ? (
          <button
            onClick={onCancel}
            className="rounded-full border border-line px-2.5 py-1 text-[11px] text-cream-dim transition-colors hover:border-red-500/40 hover:text-red-500"
          >
            {t('settings.authLoginCancel')}
          </button>
        ) : (
          <button
            onClick={onCancel}
            className="rounded-full border border-line px-2.5 py-1 text-[11px] text-cream-dim transition-colors hover:border-ink-600 hover:text-cream"
          >
            ✕
          </button>
        )}
      </div>

      {state.status === 'starting' && (
        <p className="mt-1.5 text-xs text-cream-faint">{t('settings.authLoginStarting')}</p>
      )}
      {state.status === 'waiting_for_browser' && (
        <p className="mt-1.5 text-xs text-cream-faint">
          {t('settings.authLoginBrowser')}
          {state.instructions ? ` ${state.instructions}` : ''}
        </p>
      )}
      {state.status === 'verifying' && (
        <p className="mt-1.5 text-xs text-cream-faint">
          {state.message || t('settings.authLoginVerifying')}
        </p>
      )}
      {state.status === 'waiting_for_input' && (
        <div className="mt-2">
          <p className="mb-1.5 text-xs text-cream-dim">{state.title}</p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmitInput()
              }}
              placeholder={state.placeholder ?? ''}
              className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-ink-850 px-2.5 text-[12.5px] text-cream outline-none placeholder:text-cream-faint focus:border-ink-600"
            />
            <button
              onClick={onSubmitInput}
              disabled={!inputValue.trim()}
              className="rounded-full border border-line px-3 py-1.5 text-[12px] text-cream-dim transition-colors hover:border-ink-600 hover:text-cream disabled:opacity-40"
            >
              {t('settings.authLoginSubmit')}
            </button>
          </div>
        </div>
      )}
      {state.status === 'waiting_for_select' && (
        <div className="mt-2">
          <p className="mb-1.5 whitespace-pre-line text-xs text-cream-dim">{state.title}</p>
          <div className="flex flex-wrap gap-2">
            {state.options.map((o) => (
              <button
                key={o}
                onClick={() => onSelect(o)}
                className="rounded-full border border-line px-3 py-1.5 text-[12px] text-cream-dim transition-colors hover:border-ink-600 hover:text-cream"
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
      {state.status === 'waiting_for_confirm' && (
        <div className="mt-2">
          <p className="mb-1.5 whitespace-pre-line text-xs text-cream-dim">{state.title}</p>
          {state.message && <p className="mb-1.5 text-xs text-cream-faint">{state.message}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => onConfirm(true)}
              className="rounded-full border border-line px-3 py-1.5 text-[12px] text-cream transition-colors hover:border-ink-600"
            >
              OK
            </button>
            <button
              onClick={() => onConfirm(false)}
              className="rounded-full border border-line px-3 py-1.5 text-[12px] text-cream-dim transition-colors hover:border-red-500/40 hover:text-red-500"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {state.status === 'failed' && (
        <p className="mt-1.5 text-xs text-red-500">
          {t('settings.authLoginFailed')}
          {state.message ? ` ${state.message}` : ''}
        </p>
      )}
      {state.status === 'connected' && (
        <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          {t('settings.authLoginConnected')}
        </p>
      )}
      {state.status === 'cancelled' && (
        <p className="mt-1.5 text-xs text-cream-faint">{t('settings.authLoginCancel')}</p>
      )}
    </div>
  )
}
