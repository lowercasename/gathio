import i18next from "i18next";
import moment from "moment-timezone";

type Error = {
    message?: string;
    field?: string;
};

type EventValidationResponse = {
    data?: ValidatedEventData;
    errors?: Error[];
};

type EventGroupValidationResponse = {
    data?: ValidatedEventGroupData;
    errors?: Error[];
};

interface EventData {
    eventName: string;
    eventLocation: string;
    eventStart: string;
    eventEnd: string;
    timezone: string;
    eventDescription: string;
    eventURL: string;
    imagePath: string;
    hostName: string;
    creatorEmail: string;
    publicCheckbox: string;
    eventGroupCheckbox: string;
    eventGroupID: string;
    eventGroupEditToken: string;
    interactionCheckbox: string;
    joinCheckbox: string;
    maxAttendeesCheckbox: string;
    maxAttendees: number;
}

// EventData without the 'checkbox' fields
export type ValidatedEventData = Omit<
    EventData,
    | "publicCheckbox"
    | "eventGroupCheckbox"
    | "interactionCheckbox"
    | "joinCheckbox"
    | "maxAttendeesCheckbox"
> & {
    publicBoolean: boolean;
    eventGroupBoolean: boolean;
    interactionBoolean: boolean;
    joinBoolean: boolean;
    maxAttendeesBoolean: boolean;
};

interface EventGroupData {
    eventGroupName: string;
    eventGroupDescription: string;
    eventGroupURL: string;
    hostName: string;
    creatorEmail: string;
    publicCheckbox: string;
}

export type ValidatedEventGroupData = Omit<EventGroupData, "publicCheckbox"> & {
    publicBoolean: boolean;
};

const validateEmail = (email: string) => {
    if (!email || email.length === 0 || typeof email !== "string") {
        return false;
    }
    var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

// From https://stackoverflow.com/a/43467144
const validateUrl = (url: string) => {
    if (!url) {
        return false;
    }
    let validUrl;
    try {
        validUrl = new URL(url);
    } catch (_) {
        return false;
    }
    return validUrl.protocol === "http:" || validUrl.protocol === "https:";
};

export const validateEventTime = (start: Date, end: Date): Error | boolean => {
    if (moment(start).isAfter(moment(end))) {
        return {
            message: i18next.t('util.validation.eventtime.startisafter'),
            field: "eventStart",
        };
    }
    if (moment(start).isBefore(moment())) {
        return {
            message: i18next.t('util.validation.eventtime.startisbefore'),
            field: "eventStart",
        };
    }
    if (moment(end).isBefore(moment())) {
        return {
            message: i18next.t('util.validation.eventtime.endisbefore'),
            field: "eventEnd",
        };
    }
    // Duration cannot be longer than 1 year
    if (moment(end).diff(moment(start), "years") > 1) {
        return {
            message: i18next.t("util.validation.eventtime.endyears"),
            field: "eventEnd",
        };
    }
    return true;
};

export const validateEventData = (
    eventData: EventData,
): EventValidationResponse => {
    const validatedData: ValidatedEventData = {
        ...eventData,
        publicBoolean: eventData.publicCheckbox === "true",
        eventGroupBoolean: eventData.eventGroupCheckbox === "true",
        interactionBoolean: eventData.interactionCheckbox === "true",
        joinBoolean: eventData.joinCheckbox === "true",
        maxAttendeesBoolean: eventData.maxAttendeesCheckbox === "true",
    };
    const errors: Error[] = [];
    if (!validatedData.eventName) {
        errors.push({
            message: i18next.t('util.validation.eventdata.eventname'),
            field: "eventName",
        });
    }
    if (!validatedData.eventLocation) {
        errors.push({
            message: i18next.t("util.validation.eventdata.eventlocation"),
            field: "eventLocation",
        });
    }
    if (!validatedData.eventStart) {
        errors.push({
            message: i18next.t("util.validation.eventdata.eventstart"),
            field: "eventStart",
        });
    }
    if (!validatedData.eventEnd) {
        errors.push({
            message: i18next.t("util.validation.eventdata.eventend"),
            field: "eventEnd",
        });
    }
    const timeValidation = validateEventTime(
        new Date(validatedData.eventStart),
        new Date(validatedData.eventEnd),
    );
    if (timeValidation !== true && timeValidation !== false) {
        errors.push({
            message: timeValidation.message,
        });
    }
    if (!validatedData.timezone) {
        errors.push({
            message: i18next.t("util.validation.eventdata.timezone"),
            field: "timezone",
        });
    }
    if (!validatedData.eventDescription) {
        errors.push({
            message: i18next.t("util.validation.eventdata.eventdescription"),
            field: "eventDescription",
        });
    }
    if (validatedData.eventGroupBoolean) {
        if (!validatedData.eventGroupID) {
            errors.push({
                message: i18next.t("util.validation.eventdata.eventgroupboolean"),
                field: "eventGroupID",
            });
        }
        if (!validatedData.eventGroupEditToken) {
            errors.push({
                message: i18next.t("util.validation.eventdata.eventgroupedittoken"),
                field: "eventGroupEditToken",
            });
        }
    }
    if (validatedData.maxAttendeesBoolean) {
        if (!validatedData.maxAttendees) {
            errors.push({
                message: i18next.t("util.validation.eventdata.maxattendeesboolean"),
                field: "maxAttendees",
            });
        }
        if (isNaN(validatedData.maxAttendees)) {
            errors.push({
                message: i18next.t("util.validation.eventdata.maxattendees"),
                field: "maxAttendees",
            });
        }
    }
    if (validatedData.creatorEmail) {
        if (!validateEmail(validatedData.creatorEmail)) {
            errors.push({
                message: i18next.t("util.validation.eventdata.creatoremail"),
                field: "creatorEmail",
            });
        }
    }
    if (validatedData.eventURL) {
        if (!validateUrl(validatedData.eventURL)) {
            errors.push({
                message: i18next.t("util.validation.eventdata.eventurl"),
                field: "eventURL",
            });
        }
    }

    return {
        data: validatedData,
        errors: errors,
    };
};

export const validateGroupData = (
    groupData: EventGroupData,
): EventGroupValidationResponse => {
    const errors: Error[] = [];
    if (!groupData.eventGroupName) {
        errors.push({
            message: i18next.t("util.validation.groupdata.eventgroupname"),
            field: "eventGroupName",
        });
    }
    if (!groupData.eventGroupDescription) {
        errors.push({
            message: i18next.t("util.validation.groupdata.eventgroupdescription"),
            field: "eventGroupDescription",
        });
    }
    if (groupData.creatorEmail) {
        if (!validateEmail(groupData.creatorEmail)) {
            errors.push({
                message: i18next.t("util.validation.groupdata.creatoremail"),
                field: "creatorEmail",
            });
        }
    }
    if (groupData.eventGroupURL) {
        if (!validateUrl(groupData.eventGroupURL)) {
            errors.push({
                message: i18next.t("util.validation.groupdata.eventgroupurl"),
                field: "eventGroupURL",
            });
        }
    }

    const validatedData: ValidatedEventGroupData = {
        ...groupData,
        publicBoolean: groupData.publicCheckbox === "true",
    };

    return {
        data: validatedData,
        errors: errors,
    };
};
