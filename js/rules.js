const answerModes = Object.freeze([
    Object.freeze({ id: 'single', label: 'シングル', incorrectAction: 'end', queueLimit: 1 }),
    Object.freeze({ id: 'endless', label: 'エンドレス', incorrectAction: 'advance', queueLimit: null }),
    Object.freeze({ id: 'second', label: '2着切り', incorrectAction: 'advance-if-queued', queueLimit: 2 })
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
    getMissLimitRule(id) {
        return missLimitRules[id] || missLimitRules[defaultMissLimitRule];
    }
});
