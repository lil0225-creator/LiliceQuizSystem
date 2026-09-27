import { answerModes } from './rules/answer-modes.js';
import { rulePresets } from './rules/presets.js';
import { scoringRules } from './rules/scoring/index.js';

const scoringRuleById = new Map(scoringRules.map(rule => [rule.id, rule]));
const scoreRules = Object.freeze(scoringRules.map(({ id, label }) => Object.freeze({ id, label })));
const defaultMissLimitRule = 'eliminate';
const missLimitRules = Object.freeze({
    eliminate: Object.freeze({
        onLimit(player) {
            player.status = 'lose';
            return 'eliminated';
        }
    }),
    'reduce-correct': Object.freeze({
        onLimit(player) {
            player.correct = Math.max(0, player.correct - 1);
            player.status = 'active';
            return 'continue';
        }
    })
});

function getScoringRule(id) {
    return scoringRuleById.get(id) || scoringRuleById.get('marks-eliminate');
}

const LiliceQuizRules = Object.freeze({
    answerModes,
    scoreRules,
    rulePresets,
    defaultMissLimitRule,
    missLimitRules,
    getScoreRule(id) {
        return scoreRules.find(rule => rule.id === id) || scoreRules[1];
    },
    getRulePreset(id) {
        return rulePresets.find(preset => preset.id === id) || null;
    },
    getDuelTarget() {
        return 15;
    },
    applyDuelCorrect(player, isOpponentResponse) {
        return getScoringRule('suitei-duel').applyCorrect(player, { isOpponentResponse });
    },
    applyDuelIncorrect(player, opponent, isOpponentResponse) {
        return getScoringRule('suitei-duel').applyIncorrect(player, { opponent, isOpponentResponse });
    },
    getMatchingRulePreset(settings) {
        return rulePresets.find(preset => {
            if (preset.answerMode !== settings.mode
                || preset.scoreRule !== settings.scoreRule
                || preset.winCondition !== settings.winCondition) return false;
            if (preset.scoreRule === 'suitei-duel') return true;
            if (preset.scoreRule === 'marks-eliminate' || preset.scoreRule === 'up-down'
                || preset.scoreRule === 'swedish10' || preset.scoreRule === 'ten-by-ten') {
                return preset.loseCondition === settings.loseCondition;
            }
            if (preset.scoreRule === 'marks-rest') return preset.restQuestions === settings.restQuestions;
            if (preset.scoreRule === 'ny') return preset.nyDisqualification === settings.nyDisqualification;
            return true;
        })?.id || 'custom';
    },
    getAnswerMode(id) {
        return answerModes.find(rule => rule.id === id) || answerModes[0];
    },
    getIncorrectTransition(id, hasQueuedPlayer) {
        const action = answerModes.find(rule => rule.id === id)?.incorrectAction || answerModes[0].incorrectAction;
        if (action === 'end') return 'end';
        if (action === 'advance-if-queued') return hasQueuedPlayer ? 'advance' : 'end';
        return 'advance-or-wait';
    },
    getPlayerScore(player, scoreRuleId, settings = {}) {
        return getScoringRule(scoreRuleId).getScore(player, settings);
    },
    getScorePresentation(player, scoreRuleId, settings = {}) {
        return getScoringRule(scoreRuleId).getPresentation(player, settings);
    },
    applyCorrect(player, scoreRuleId, settings = {}) {
        return getScoringRule(scoreRuleId).applyCorrect(player, settings);
    },
    applyIncorrect(player, scoreRuleId, settings = {}) {
        return getScoringRule(scoreRuleId).applyIncorrect(player, settings);
    },
    isPlayerDisqualified(player, scoreRuleId, settings = {}) {
        return getScoringRule(scoreRuleId).isDisqualified(player, settings);
    },
    normalizeScoreRule(id) {
        if (id === 'standard') return 'marks-eliminate';
        return scoringRuleById.has(id) ? id : 'marks-eliminate';
    },
    getMissLimitRule(id) {
        return missLimitRules[id] || missLimitRules[defaultMissLimitRule];
    }
});

window.LiliceQuizRules = LiliceQuizRules;

export { LiliceQuizRules };