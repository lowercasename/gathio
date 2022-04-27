const getStoredToken = function(eventID) {
    try {
        let editTokens = JSON.parse(localStorage.getItem('editTokens'));
        return editTokens[eventID];
    } catch(e) {
        localStorage.setItem('editTokens', JSON.stringify({}));
        return false;
    }
}

const addStoredToken = function(eventID, token) {
    try {
        let editTokens = JSON.parse(localStorage.getItem('editTokens'));
        editTokens[eventID] = token;
        localStorage.setItem('editTokens', JSON.stringify(editTokens));
    } catch(e) {
        localStorage.setItem('editTokens', JSON.stringify({ [eventID]: token }));
        return false;
    }
} 

const removeStoredToken = function(eventID) {
    try {
        let editTokens = JSON.parse(localStorage.getItem('editTokens'));
        delete editTokens[eventID];
        localStorage.setItem('editTokens', JSON.stringify(editTokens));
    } catch(e) {
        localStorage.setItem('editTokens', JSON.stringify({}));
        return false;
    }
}
