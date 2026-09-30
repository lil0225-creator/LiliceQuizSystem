export default Object.freeze({
    id: 'up-down',
    label: 'Up/Down',
    getScore(player) {
        return Number.isFinite(player.upDownScore) ? player.upDownScore : player.correct;
    },
    applyCorrect(player) {
        player.correct++;
        player.upDownScore = (player.upDownScore || 0) + 1;
    },
    applyIncorrect(player) {
        player.incorrect++;
        if (player.incorrect === 1) player.upDownScore = 0;
    },
    isDisqualified(player, settings) {
        return settings.loseCondition > 0 && player.incorrect >= settings.loseCondition;
    },
    getPresentation(player) {
        return {
            type: 'points',
            value: Number.isFinite(player.upDownScore) ? player.upDownScore : player.correct,
        };
    },
});
