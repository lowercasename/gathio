export const exitWithError = (message: string) => {
    console.error(`\x1b[31m${message}`);
    process.exit(1);
};
