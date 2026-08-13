const getStoredToken = function (eventID) {
    try {
        let editTokens = JSON.parse(localStorage.getItem("editTokens"));
        return editTokens[eventID];
    } catch (e) {
        localStorage.setItem("editTokens", JSON.stringify({}));
        return false;
    }
};

const addStoredToken = function (eventID, token) {
    try {
        let editTokens = JSON.parse(localStorage.getItem("editTokens"));
        editTokens[eventID] = token;
        localStorage.setItem("editTokens", JSON.stringify(editTokens));
    } catch (e) {
        localStorage.setItem(
            "editTokens",
            JSON.stringify({ [eventID]: token }),
        );
        return false;
    }
};

const removeStoredToken = function (eventID) {
    try {
        let editTokens = JSON.parse(localStorage.getItem("editTokens"));
        delete editTokens[eventID];
        localStorage.setItem("editTokens", JSON.stringify(editTokens));
    } catch (e) {
        localStorage.setItem("editTokens", JSON.stringify({}));
        return false;
    }
};

const unexpectedError = [
    { message: "An unexpected error has occurred. Please try again later." },
];

// Custom RSVP questions: shared state and methods for the new event and edit
// event Alpine.js form components. Spread the return value into the component.
// `initialQuestions` is the array stored on the event (options as strings);
// options are wrapped in objects so Alpine's x-model can bind to them.
const customQuestionsForm = function (initialQuestions) {
    // Kept in step with maxCustomQuestions/maxCustomQuestionOptions in
    // src/models/Event.ts, which enforce these limits server-side
    const maxCustomQuestions = 6;
    const maxCustomQuestionOptions = 10;
    // Client-only unique keys for Alpine's x-for, so that removing a
    // question or option mid-list doesn't leave stale inputs behind
    let nextUid = 0;
    return {
        maxCustomQuestions,
        maxCustomQuestionOptions,
        customQuestions: (initialQuestions || []).map((question) => ({
            _uid: nextUid++,
            id: question.id,
            prompt: question.prompt,
            type: question.type || "text",
            options: (question.options || []).map((option) => ({
                _uid: nextUid++,
                text: option,
            })),
        })),
        addCustomQuestion() {
            if (this.customQuestions.length >= maxCustomQuestions) {
                return;
            }
            this.customQuestions.push({
                _uid: nextUid++,
                id: "",
                prompt: "",
                type: "text",
                options: [],
            });
        },
        removeCustomQuestion(questionIndex) {
            this.customQuestions.splice(questionIndex, 1);
        },
        customQuestionTypeChanged(question) {
            // Seed a multiple choice question with two empty choices
            if (
                question.type === "multipleChoice" &&
                question.options.length === 0
            ) {
                question.options.push(
                    { _uid: nextUid++, text: "" },
                    { _uid: nextUid++, text: "" },
                );
            }
        },
        addCustomQuestionOption(question) {
            if (question.options.length >= maxCustomQuestionOptions) {
                return;
            }
            question.options.push({ _uid: nextUid++, text: "" });
        },
        removeCustomQuestionOption(question, optionIndex) {
            question.options.splice(optionIndex, 1);
        },
        serializeCustomQuestions() {
            return JSON.stringify(
                this.customQuestions
                    .filter((question) => question.prompt.trim() !== "")
                    .map((question) => ({
                        id: question.id,
                        prompt: question.prompt.trim(),
                        type: question.type,
                        options: question.options
                            .map((option) => option.text.trim())
                            .filter((text) => text !== ""),
                    })),
            );
        },
    };
};
