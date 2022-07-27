import path from "path";

export const getFile = (filename: String) => {
    return path.join(__dirname, "../../../dist/client/" + filename + ".html");
};
