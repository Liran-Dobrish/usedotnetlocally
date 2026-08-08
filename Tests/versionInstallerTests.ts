"use strict";
import * as tl from 'azure-pipelines-task-lib/task';
var mockery = require('azure-pipelines-task-lib/lib-mocker');
mockery.enable({
    useCleanCache: true,
    warnOnReplace: false,
    warnOnUnregistered: false
});

mockery.registerMock('azure-pipelines-task-lib/task', {
    exist: function (path: string) { tl.debug(tl.loc("inexist")); return false; },
    mkdirP: function (path: string) {
        tl.debug(tl.loc("inmkdirp"))
        throw "";
    },
    loc: function (locString: string, param: string[]) { return tl.loc(locString, param); },
    debug: function (message: string) { return tl.debug(message); },
    error: function (errorMessage: string) { return tl.error(errorMessage); },
    getVariable: function (variableName: string) { return tl.getVariable(variableName)!; },
    getInput: function (inputName: string, required: boolean) { return tl.getInput(inputName, required); },
    getHttpProxyConfiguration: function () { return ""; },
    getHttpCertConfiguration: function () { return "" },
    setResourcePath: function (path: string) { return; }
});

import { VersionInstaller } from "../src/versioninstaller";

try {
    new VersionInstaller("sdk", "C:/unknownlocation");
}
catch (ex) {
    tl.setResult(tl.TaskResult.Failed, "ThrownAsExpected");
}

tl.setResult(tl.TaskResult.Succeeded, "DidNotThrowAsExpected");