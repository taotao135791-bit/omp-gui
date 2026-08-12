import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { useT } from '../i18n'
import AuthSection from './AuthSection'
import RuntimeModelSection from './RuntimeModelSection'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-line bg-ink-850 shadow-card">
      <div className="border-b border-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-faint">
        {title}
      </div>
      <div className="divide-y divide-line/60 px-4">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-[13px] text-cream">{label}</span>
      {children}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="py-2.5 text-[11px] leading-relaxed text-cream-faint">{children}</p>
}

/**
 * Settings for the CURRENT Oh My Pi runtime: native auth, runtime-backed
 * model/thinking defaults, runtime-backed machine skills. Every control
 * reads and writes the runtime's own state (omp config / RPC) with
 * read-after-write verification — this component must never touch legacy
 * auth.json/settings.json APIs.
 */
export default function CurrentOmpSettings() {
  const overview = useAppStore((s) => s.runtimeOverview)
  const t = useT()
  const [machineSkills, setMachineSkillsState] = useState<boolean | null>(null)
  const [machineSkillCount, setMachineSkillCount] = useState(0)
  const [machinePending, setMachinePending] = useState(false)
  const [machineError, setMachineError] = useState<string | null>(null)

  // The toggle state is runtime truth (skills.enableAgentsUser), not a GUI flag.
  useEffect(() => {
    if (overview?.profile === 'current') {
      setMachineSkillsState(overview.machineSkillsEnabled)
    }
  }, [overview])
  useEffect(() => {
    window.electronAPI.listMachineSkills().then((names) => setMachineSkillCount(names.length))
  }, [])

  const changeMachineSkills = async (enabled: boolean) => {
    if (machinePending) return
    setMachinePending(true)
    setMachineError(null)
    const result = await useAppStore.getState().setRuntimeMachineSkills(enabled)
    setMachinePending(false)
    if (result.ok) {
      setMachineSkillsState(enabled)
    } else {
      // Rollback: the toggle shows the last runtime-confirmed state.
      setMachineSkillsState(useAppStore.getState().runtimeOverview?.machineSkillsEnabled ?? null)
      setMachineError(result.error ?? 'failed')
    }
  }

  const seg = (active: boolean) =>
    `flex h-[26px] items-center rounded-full border px-2.5 text-[12px] font-medium transition-colors ${
      active
        ? 'border-line bg-ink-850 text-cream shadow-card'
        : 'border-transparent text-cream-dim hover:text-cream'
    }`

  return (
    <>
      <AuthSection />
      <RuntimeModelSection />

      <Section title={t('settings.skills')}>
        <Row label={t('settings.machineSkills')}>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-line bg-ink-800 p-0.5">
              <button
                onClick={() => changeMachineSkills(true)}
                disabled={machinePending}
                className={seg(machineSkills === true)}
              >
                {t('settings.on')}
              </button>
              <button
                onClick={() => changeMachineSkills(false)}
                disabled={machinePending}
                className={seg(machineSkills === false)}
              >
                {t('settings.off')}
              </button>
            </div>
            {machinePending && <span className="text-xs text-cream-faint">…</span>}
          </div>
        </Row>
        {machineError && (
          <Note>
            <span className="text-red-500">{t('settings.saveFailed', { error: machineError })}</span>
          </Note>
        )}
        <Note>
          {machineSkillCount > 0
            ? t('settings.machineSkillsNoteCount', { count: machineSkillCount })
            : t('settings.machineSkillsNote')}
        </Note>
      </Section>
    </>
  )
}
