import * as ac from 'ansi-colors'

export function doHelp(command:string) {
    switch (command) {
        case 'help':
            return helpHelp();
        case 'init':
            return helpInit()
        case 'build':
            return helpBuild();
        case 'run':
            return helpRun();
        case 'doc':
            return helpDoc();
        case 'test':
            return helpTest();
        case 'dist':
            return helpDist();
        case 'nativescript':
            return helpNativeScript();
        default:
            return helpDefault();
    }
}
function helpDefault() {
    console.log('jove is the command-line tool of the Jove framework.');
    console.log(ac.bold("Usage: " + ac.grey("jove " + ac.grey.dim("command  [args]"))));
    console.log("where " + ac.grey.dim("command") + " is one of:");
    console.log("  " + ac.blue.bold("help " + ac.grey.dim("[command]")) + " -- general help, or help on a given command");
    console.log("  " + ac.blue.bold("init") + "  -- create or prepare a directory as a Jove project");
    console.log("  " + ac.blue.bold("build") + "  -- build the project for desktop");
    console.log("  " + ac.blue.bold("run") + "  -- build and run the desktop project");
    console.log("  " + ac.blue.bold("doc") + "  -- generate documentation from JavaDoc-style comment blocks");
    console.log("  " + ac.blue.bold("test") + "  -- run tests");
    console.log("  " + ac.blue.bold("dist") + "  -- create distribution installer");
    console.log("  " + ac.blue.bold("nativescript") + "-- Export to a Nativescript Mobile project");
    console.log('');
    console.log('zero or more arguments may follow a command, and are specific to the context of that command.');
    console.log('');
}
function helpHelp() {
    console.log(ac.bold('help'));
    console.log("use " + ac.bold('jove help') + " by itself to see a list of commands");
    console.log("use " + ac.bold("jove help " + ac.grey.dim('[command]')) + " for help on a given command");
    console.log('');
}
function helpInit() {
    console.log(ac.bold('init'));
    console.log("use " + ac.bold('jove init') + " from within a directory to init the current directory as a jove-project");
    console.log("use " + ac.bold("jove init " + ac.grey.dim('name')) + " to create a directory and start init on a project of that name");
    console.log("")
    console.log("This will begin an interactive session where you will be asked questions about the project you are creating.")
    console.log("The project will be complete and ready to run right away.")
    console.log("You can then modify the application to your needs.")

}
function helpBuild() {
    console.log(ac.bold('build'));
    console.log('builds the desktop project');
    console.log('');
    console.log("use "+ac.bold('jove build .') + 'build the current project')
    console.log(" or provide a path to the project directory as the argument.")
    console.log(ac.green('options:'))
    console.log(ac.bold('    --clean') + ': clears any previous build artifacts before building')
    console.log(ac.bold('    --prepare') + ': creates generated files, but does not do webpack bundling')
    console.log(ac.bold('    --compile') + ': does not regenerate files; performs webpack compile operation only')
    console.log('')
    console.log('Ths use of "prepare" and "clean" is mutually exclusive')
    console.log('Normal operation (no options) is to do both a prepare and compile step.  This will create a "build" folder that will contain' +
        'the assets for running the application, along with an executable file of the project\'s name.')
    console.log('Files are generated to a ".gen/" folder within the project directory.')
    console.log('Generated files include conversion of .jvpg and .jvcm files into .riot files, and creation of CSS from the SCSS sources.')
    console.log('Generated files are not replaced unless corresponding source file is newer.')
}
function helpRun() {
    console.log(ac.bold('run'));
    console.log('builds (if necessary) and then runs the desktop project');
    console.log('')
    console.log("use "+ac.bold('jove build .') + 'build the current project')
    console.log(" or provide a path to the project directory as the argument.")
    console.log("Source files are checked for update since the date of the executable.  If sources are newer, the project is built before running.")

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
function helpDist() {
    console.log(ac.bold('dist'));
    console.log('Generates an installer package for the project')
    console.log('Installer will be for current OS target only')
    console.log(ac.dim('later version will include publishing options'))
    console.log('')
}
function helpNativeScript() {
    console.log(ac.bold('nativescript'));
    console.log('Exports project into a new project space for Nativescript mobile development');
    console.log(ac.green('options:'))
    console.log(ac.bold('    --outPath') +' <path>: sets the destination root path to something other than "../nativescript".')
    console.log(ac.bold('    --appid') +' <com.reverse.id>: sets the appid to something other than what is defined by "projId" in package.json')
    console.log(ac.bold('    --clean') + ': clears any previous Nativescript project at destination before continuing.')
    console.log('');
    console.log('Unless otherwise specified by the --outPath option, the base path for output will be ' +
    'set as "../nativescript" relative to the current project directory.')
    console.log('A Nativescript project will be generated here  in a folder with the project name as defined in the package.json file')
    console.log('If the folder exists, it is checked to verify it is a Nativescript project before continuing')
    console.log('An invalid existing folder or file here will abort the export')
    console.log('A previously generated Nativescript project will be updated from new sources, ' +
        'but stale files whose sources have been removed will not be removed by such an operation.')
    console.log('Use the "clean" option to force the generation of a new project over an existing one in such a case.')
    console.log('The project\'s package.json file must define a project name')
    console.log('If the project package.json file does not provide "projId" and no --appId option is provided, the appId will be set to "jove.ns.<appName>"')

}
