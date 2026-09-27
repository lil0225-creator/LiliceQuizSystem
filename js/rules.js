const answerModes = Object.freeze([
    Object.freeze({ id: 'single', label: 'シングル', incorrectAction: 'end', queueLimit: 1 }),
    Object.freeze({ id: 'endless', label: 'エンドレス', incorrectAction: 'advance', queueLimit: null }),
    Object.freeze({ id: 'second', label: '2着切り', incorrectAction: 'advance-if-queued', queueLimit: 2 })
]);
const scoreRules = Object.freeze([
    Object.freeze({ id: 'marks-rest', label: 'N〇N休' }),
    Object.freeze({ id: 'marks-eliminate', label: 'N〇N✕' }),
    Object.freeze({ id: 'ny', label: 'NYルール' })
]);
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

window.LiliceQuizRules = Object.freeze({
    answerModes,
    scoreRules,
    defaultMissLimitRule,
    missLimitRules,
    getAnswerMode(id) {
        return answerModes.find(rule => rule.id === id) || answerModes[0];
    },
    getIncorrectTransition(id, hasQueuedPlayer) {
        const action = answerModes.find(rule => rule.id === id)?.incorrectAction || answerModes[0].incorrectAction;
        if (action === 'end') return 'end';
        if (action === 'advance-if-queued') return hasQueuedPlayer ? 'advance' : 'end';
        return 'advance-or-wait';
    },
    getPlayerScore(player, scoreRuleId) {
        return scoreRuleId === 'ny' ? player.correct - player.incorrect : player.correct;
    },
    normalizeScoreRule(id) {
        if (id === 'standard') return 'marks-eliminate';
        return scoreRules.some(rule => rule.id === id) ? id : scoreRules[1].id;
    },
    getMissLimitRule(id) {
        return missLimitRules[id] || missLimitRules[defaultMissLimitRule];
    }
});
