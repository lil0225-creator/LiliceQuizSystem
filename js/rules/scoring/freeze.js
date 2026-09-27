export default Object.freeze({
    id: 'freeze',
    label: 'Freeze',
    getScore(player) {
        return player.correct;
    },
    applyCorrect(player) {
        player.correct++;
    },
    applyIncorrect(player) {
        player.incorrect++;
        player.restQuestionsPending = player.incorrect;
    },
    isDisqualified() {
        return false;
    },
    getPresentation(player) {
        return { type: 'marks', correct: player.correct, incorrect: player.incorrect };
    }
});