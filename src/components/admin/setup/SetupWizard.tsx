'use client';

import { useCmd } from '../CommandProvider';
import { W0, W1 } from './W0W1';
import { W2 } from './W2';
import { W3 } from './W3';
import { W4, W5 } from './W4W5';

/** Geführter Setup-Wizard nach [R] „Setup the Campaign Map“ (SPEC 8.2) */
export function SetupWizard() {
  const { state } = useCmd();
  if (state.stage.kind !== 'SETUP') return null;
  switch (state.stage.step) {
    case 'W0':
      return <W0 />;
    case 'W1':
      return <W1 />;
    case 'W2':
      return <W2 />;
    case 'W3':
      return <W3 />;
    case 'W4':
      return <W4 />;
    case 'W5':
      return <W5 />;
  }
}
