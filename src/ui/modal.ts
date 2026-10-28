/**
 * Confirmation modal used by the grid (delete rows, discard changes) instead of window.confirm().
 * Accessible: role="alertdialog", focus trapped inside, Esc / backdrop click cancel, focus restored.
 */
import { h } from './dom.ts';
import type { ConfirmRequest, Translator } from '../types.ts';

export function openConfirm(container: HTMLElement, request: ConfirmRequest, t: Translator): Promise<boolean> {
    return new Promise(resolve => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const id = `ig-modal-${Math.random().toString(36).slice(2)}`;

        const cancel = h('button', { type: 'button', class: 'ig-btn', text: request.cancelLabel ?? t('cancel') });
        const confirm = h('button', {
            type: 'button',
            class: `ig-btn ${request.danger ? 'ig-btn-danger-solid' : 'ig-btn-primary'}`,
            text: request.confirmLabel ?? t('confirm')
        });
        const dialog = h('div', {
            class: 'ig-modal',
            role: 'alertdialog',
            'aria-modal': 'true',
            'aria-labelledby': `${id}-title`,
            'aria-describedby': `${id}-message`
        },
        h('h2', { class: 'ig-modal-title', id: `${id}-title`, text: request.title ?? t('confirmTitle') }),
        h('p', { class: 'ig-modal-message', id: `${id}-message`, text: request.message }),
        h('div', { class: 'ig-modal-actions' }, cancel, confirm));
        const backdrop = h('div', { class: 'ig-modal-backdrop' }, dialog);

        const close = (answer: boolean) => {
            backdrop.remove();
            document.removeEventListener('keydown', onKey, true);
            previous?.focus();
            resolve(answer);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close(false);
            } else if (e.key === 'Tab') {
                // keep focus inside the two buttons
                e.preventDefault();
                (document.activeElement === cancel ? confirm : cancel).focus();
            }
        };

        cancel.addEventListener('click', () => close(false));
        confirm.addEventListener('click', () => close(true));
        backdrop.addEventListener('pointerdown', e => {
            if (e.target === backdrop) close(false);
        });
        document.addEventListener('keydown', onKey, true);

        container.append(backdrop);
        // destructive actions start on "Cancel", so a stray Enter does not delete anything
        (request.danger ? cancel : confirm).focus();
    });
}
