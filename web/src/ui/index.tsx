// The 5 primitives. Every screen is built from these only.
import type {
  ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes,
} from 'react';

export const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

type Tone = { tone?: string };

export function Card({ tone = 'bg-white', className, ...p }: HTMLAttributes<HTMLDivElement> & Tone) {
  return <div {...p} className={cx('brut p-5 lg:p-7', tone, className)} />;
}

const press = 'enabled:cursor-pointer enabled:active:translate-x-[2px] enabled:active:translate-y-[2px] enabled:active:shadow-[2px_2px_0_#111] disabled:opacity-50';

export function Button({ tone = 'bg-yellow', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & Tone) {
  return <button {...p} className={cx('brut px-6 py-3 text-xl font-bold', press, tone, className)} />;
}

/** Toggle chip: filled with `tone` when on. */
export function Chip({ on, tone = 'bg-yellow', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & Tone & { on: boolean }) {
  return (
    <button type="button" aria-pressed={on} {...p}
      className={cx('brut px-4 py-2 text-lg font-bold', press, on ? tone : 'bg-white', className)} />
  );
}

const field = 'brut w-full bg-white px-4 py-3 text-lg outline-none placeholder:text-ink/40 focus:bg-yellow/15 disabled:opacity-60';

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(field, className)} />;
}

/** Multi-line flavor of Input. */
export function TextArea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(field, 'resize-y', className)} />;
}

/** `big` for domain pills. */
export function Badge({ tone = 'bg-white', big, className, ...p }: HTMLAttributes<HTMLSpanElement> & Tone & { big?: boolean }) {
  return (
    <span {...p}
      className={cx('inline-block rounded-[4px] border-2 border-ink font-bold', big ? 'px-3 py-1 text-base' : 'px-2.5 py-0.5 text-sm', tone, className)} />
  );
}
