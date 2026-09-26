window.LiliceQuizRules = {
    answerModes: [
        { id: 'single', label: 'シングル', incorrectAction: 'end', queueLimit: null },
        { id: 'endless', label: 'エンドレス', incorrectAction: 'advance', queueLimit: null },
        { id: 'second', label: '2着切り', incorrectAction: 'advance-if-queued', queueLimit: 2 }
    ],
    defaultMissLimitRule: 'eliminate',
    missLimitRules: {
        eliminate: {
            onLimit(player) {
                player.status = 'lose';
                return 'eliminated';
            }
        },
        'reduce-correct': {
            onLimit(player) {
                player.correct = Math.max(0, player.correct - 1);
                player.status = 'active';
                return 'continue';
            }
        }
    },
    getAnswerMode(id) {
        return this.answerModes.find(rule => rule.id === id) || this.answerModes[0];
    },
    getMissLimitRule(id) {
        return this.missLimitRules[id] || this.missLimitRules[this.defaultMissLimitRule];
    }
};
