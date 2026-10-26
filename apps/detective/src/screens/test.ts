/**
 * Main test screen: 4-grid layout, tap to answer, "can't tell" button,
 * progress bar, attention check trials.
 */

import { drawStimulus, drawAttentionCheck, DEFAULT_CONFIG } from '../stimulus.js';
import type { ConfusionAxis } from '@cvd-tools/color-core';
import {
  type StaircaseState,
  type TrialRecord,
  createStaircaseState,
  pickNextAxis,
  processResponse,
  isFinished,
  shouldAttentionCheck,
  getTotalProgress,
  hesitationWeight,
  rtBaseline,
  recordAttentionCheckRt,
} from '../staircase.js';
import { t } from '../i18n/i18n.js';
import { cellButtonsHtml } from './cells.js';

export function renderTest(
  container: HTMLElement,
  onComplete: (state: StaircaseState) => void,
  practiceRts: number[] = [],
): void {
  const state = createStaircaseState(practiceRts);
  let currentAxis: ConfusionAxis | null = null;
  let currentTarget = 0;
  let trialStartTime = 0;
  let isAttentionTrial = false;
  let waiting = false;

  container.innerHTML = `
    <div class="screen test-screen">
      <div class="progress-bar-container" role="progressbar" aria-label="${t('test.progress')}">
        <div class="progress-bar" id="progress-bar"></div>
        <span class="progress-text" id="progress-text">0%</span>
      </div>
      <p class="trial-counter" id="trial-counter">${t('test.trial', { n: 1 })}</p>
      <canvas id="test-canvas" class="stimulus-canvas"></canvas>
      <div class="cell-buttons" id="test-buttons">
        ${cellButtonsHtml()}
      </div>
      <button class="btn-secondary" id="cant-tell">
        <span class="btn-icon" aria-hidden="true">?</span>
        <span>${t('test.cantTell')}</span>
      </button>
      <div class="feedback" id="test-feedback"></div>
    </div>
  `;

  const canvas = container.querySelector('#test-canvas') as HTMLCanvasElement;
  const progressBar = container.querySelector('#progress-bar') as HTMLElement;
  const progressText = container.querySelector('#progress-text') as HTMLElement;
  const trialCounter = container.querySelector('#trial-counter') as HTMLElement;
  const feedback = container.querySelector('#test-feedback') as HTMLElement;
  const buttons = container.querySelectorAll('.cell-btn') as NodeListOf<HTMLButtonElement>;
  const cantTellBtn = container.querySelector('#cant-tell') as HTMLButtonElement;

  function updateProgress(): void {
    const p = getTotalProgress(state);
    progressBar.style.width = `${(p * 100).toFixed(0)}%`;
    progressText.textContent = `${(p * 100).toFixed(0)}%`;
    trialCounter.textContent = t('test.trial', { n: state.totalTrials + 1 });
  }

  function nextTrial(): void {
    if (isFinished(state)) {
      onComplete(state);
      return;
    }

    isAttentionTrial = shouldAttentionCheck(state);
    currentTarget = Math.floor(Math.random() * 4);

    if (isAttentionTrial) {
      drawAttentionCheck(canvas, currentTarget, DEFAULT_CONFIG);
      currentAxis = null;
    } else {
      currentAxis = pickNextAxis(state)!;
      if (!currentAxis) {
        onComplete(state);
        return;
      }
      const offset = state.axes[currentAxis].currentLevel;
      drawStimulus(canvas, { targetIndex: currentTarget, axis: currentAxis, offset }, DEFAULT_CONFIG);
    }

    feedback.textContent = '';
    feedback.className = 'feedback';
    buttons.forEach(b => {
      b.disabled = false;
      b.classList.remove('selected', 'correct-cell', 'wrong-cell');
    });
    cantTellBtn.disabled = false;
    waiting = false;
    trialStartTime = performance.now();
    updateProgress();
  }

  function recordTrial(response: number): void {
    if (waiting) return;
    waiting = true;

    const rt = performance.now() - trialStartTime;
    const correct = response === currentTarget;

    buttons.forEach(b => b.disabled = true);
    cantTellBtn.disabled = true;

    if (response >= 0 && response <= 3) {
      buttons[response].classList.add('selected');
    }

    if (isAttentionTrial) {
      if (!correct) state.attentionChecksFailed++;
      const timing = hesitationWeight(rt, rtBaseline(state));
      recordAttentionCheckRt(state, rt, correct);
      const trial: TrialRecord = {
        axis: 'protan',
        offset: 0,
        response,
        correct,
        targetIndex: currentTarget,
        rt,
        isAttentionCheck: true,
        trialNumber: state.totalTrials,
        ...timing,
      };
      state.trials.push(trial);
      state.totalTrials++;
    } else if (currentAxis) {
      const offset = state.axes[currentAxis].currentLevel;
      const timing = processResponse(state, currentAxis, correct, rt);
      const trial: TrialRecord = {
        axis: currentAxis,
        offset,
        response,
        correct,
        targetIndex: currentTarget,
        rt,
        isAttentionCheck: false,
        trialNumber: state.totalTrials,
        ...timing,
      };
      state.trials.push(trial);
      state.totalTrials++;
    }

    setTimeout(() => {
      nextTrial();
    }, 300);
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      recordTrial(parseInt(btn.dataset.index!));
    });
  });

  cantTellBtn.addEventListener('click', () => {
    recordTrial(-1);
  });

  nextTrial();
}
