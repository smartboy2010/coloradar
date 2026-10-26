/**
 * Practice screen: 3 high-contrast trials to teach the interaction.
 */

import { drawStimulus, DEFAULT_CONFIG, type StimulusConfig } from '../stimulus.js';
import type { ConfusionAxis } from '@cvd-tools/color-core';
import { t } from '../i18n/i18n.js';
import { cellButtonsHtml } from './cells.js';

export function renderPractice(
  container: HTMLElement,
  onComplete: (correctRts: number[]) => void,
): void {
  let practiceIndex = 0;
  let trialStart = 0;
  // The first round includes learning the interaction, so it is not a fair RT sample.
  const correctRts: number[] = [];
  const totalPractice = 3;

  const axes: ConfusionAxis[] = ['protan', 'deutan', 'tritan'];
  const highContrast = 0.08;

  container.innerHTML = `
    <div class="screen practice-screen">
      <div class="screen-content">
        <h2>${t('practice.title')}</h2>
        <p class="practice-hint" id="practice-hint">${t('practice.hint', { total: totalPractice })}</p>
        <p class="practice-count" id="practice-count">${t('practice.count', { n: 1, total: totalPractice })}</p>
        <canvas id="practice-canvas" class="stimulus-canvas"></canvas>
        <div class="cell-buttons" id="practice-buttons">
          ${cellButtonsHtml()}
        </div>
        <div class="feedback" id="practice-feedback"></div>
      </div>
    </div>
  `;

  const canvas = container.querySelector('#practice-canvas') as HTMLCanvasElement;
  const feedback = container.querySelector('#practice-feedback') as HTMLElement;
  const countEl = container.querySelector('#practice-count') as HTMLElement;
  const buttons = container.querySelectorAll('.cell-btn') as NodeListOf<HTMLButtonElement>;

  let currentTarget = 0;
  let waiting = false;

  function drawPractice(): void {
    currentTarget = Math.floor(Math.random() * 4);
    const axis = axes[practiceIndex % axes.length];
    drawStimulus(canvas, { targetIndex: currentTarget, axis, offset: highContrast }, DEFAULT_CONFIG);
    feedback.textContent = '';
    feedback.className = 'feedback';
    buttons.forEach(b => {
      b.disabled = false;
      b.classList.remove('selected', 'correct-cell', 'wrong-cell');
    });
    trialStart = performance.now();
  }

  function handleClick(index: number): void {
    if (waiting) return;
    waiting = true;
    const correct = index === currentTarget;
    if (correct && practiceIndex > 0) correctRts.push(performance.now() - trialStart);

    buttons.forEach(b => b.disabled = true);
    buttons[index].classList.add('selected');

    if (correct) {
      buttons[index].classList.add('correct-cell');
      feedback.innerHTML = `<span class="feedback-icon" aria-hidden="true">✓</span> ${t('practice.correct')}`;
      feedback.className = 'feedback feedback-correct';
    } else {
      buttons[index].classList.add('wrong-cell');
      buttons[currentTarget].classList.add('correct-cell');
      feedback.innerHTML = `<span class="feedback-icon" aria-hidden="true">✗</span> ${t('practice.wrong')}`;
      feedback.className = 'feedback feedback-wrong';
    }

    setTimeout(() => {
      practiceIndex++;
      if (practiceIndex >= totalPractice) {
        onComplete(correctRts);
      } else {
        countEl.textContent = t('practice.count', { n: practiceIndex + 1, total: totalPractice });
        waiting = false;
        drawPractice();
      }
    }, 1200);
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      handleClick(parseInt(btn.dataset.index!));
    });
  });

  drawPractice();
}
