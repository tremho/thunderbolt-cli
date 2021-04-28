import * as ac from 'ansi-colors'

export function doHelp(command:string) {
    switch (command) {
        case 'help':
            return helpHelp();
        case 'build':
            return helpBuild();
        case 'run':
            return helpRun();
        case 'doc':
            return helpDoc();
        case 'test':
            return helpTest();
        case 'nativescript':
            return helpNativeScript();
        default:
            return helpDefault();
    }
}
function helpDefault() {
    console.log('tbx is the command-line tool of the Thunderbolt framework.');
    console.log(ac.bold("Usage: " + ac.grey("tbx " + ac.grey.dim("command  [args]"))));
    console.log("where " + ac.grey.dim("command") + " is one of:");
    console.log("  " + ac.blue.bold("help " + ac.grey.dim("[command]")) + " -- general help, or help on a given command");
    console.log("  " + ac.blue.bold("build") + "  -- build the project for desktop");
    console.log("  " + ac.blue.bold("run") + "  -- build and run the desktop project");
    console.log("  " + ac.blue.bold("doc") + "  -- generate documentation from JavaDoc-style comment blocks");
    console.log("  " + ac.blue.bold("test") + "  -- run tests");
    console.log("  " + ac.blue.bold("nativescript") + "-- Export to a Nativescript Mobile project");
    console.log('');
    console.log('zero or more arguments may follow a command, and are specific to the context of that command.');
    console.log('');
}
function helpHelp() {
    console.log(ac.bold('help'));
    console.log("use " + ac.bold('tbx help') + " by itself to see a list of commands");
    console.log("use " + ac.bold("tbx help " + ac.grey.dim('[command]')) + " for help on a given command");
    console.log('');
}
function helpBuild() {
    console.log(ac.bold('build'));
    console.log('builds the desktop project');
    console.log('');
}
function helpRun() {
    console.log(ac.bold('run'));
    console.log('builds and then runs the desktop project');
}
function helpDoc() {
    console.log(ac.bold('doc'));
    console.log('Generates the documentation for the project');
    console.log('');
}
function helpTest() {
    console.log(ac.bold('test'));
    console.log('Executes the tests defined for the project');
    console.log('');
}
function helpNativeScript() {
    console.log(ac.bold('test'));
    console.log('Exports project into a new project space for Nativescript mobile development');
    console.log('');
}
