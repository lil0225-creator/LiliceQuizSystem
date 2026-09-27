import marksRest from './marks-rest.js';
import marksEliminate from './marks-eliminate.js';
import ny from './ny.js';
import upDown from './up-down.js';
import freeze from './freeze.js';
import swedish10 from './swedish10.js';
import tenByTen from './ten-by-ten.js';
import duel from './duel.js';

export const scoringRules = Object.freeze([
    marksRest,
    marksEliminate,
    ny,
    upDown,
    freeze,
    swedish10,
    tenByTen,
    duel
]);