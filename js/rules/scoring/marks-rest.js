export default Object.freeze({
    id: 'marks-rest',
    label: 'N〇N休',
    getScore(player) {
        return player.correct;
    },
    applyCorrect(player) {
        player.correct++;
    },
    applyIncorrect(player, settings) {
        player.incorrect++;
        if (settings.restQuestions > 0) player.restQuestionsPending = settings.restQuestions;
    },
    isDisqualified() {
        return false;
    },
    getPresentation(player) {
        return { type: 'marks', correct: player.correct, incorrect: player.incorrect };
    },
});
