export default Object.freeze({
    id: 'marks-eliminate',
    label: 'N〇N✕',
    getScore(player) {
        return player.correct;
    },
    applyCorrect(player) {
        player.correct++;
    },
    applyIncorrect(player) {
        player.incorrect++;
    },
    isDisqualified(player, settings) {
        return (
            settings.missLimitRuleId !== 'reduce-correct' &&
            settings.loseCondition > 0 &&
            player.incorrect >= settings.loseCondition
        );
    },
    getPresentation(player) {
        return { type: 'marks', correct: player.correct, incorrect: player.incorrect };
    },
});
