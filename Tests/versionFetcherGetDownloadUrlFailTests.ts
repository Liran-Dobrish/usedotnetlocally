"use strict";
import * as tl from 'azure-pipelines-task-lib/task';
import * as os from 'os';
import { toolrunner } from './mocks/mockedModels';
var mockery = require('azure-pipelines-task-lib/lib-mocker');

mockery.enable({
    useCleanCache: true,
    warnOnReplace: false,
    warnOnUnregistered: false
});

mockery.registerMock('typed-rest-client/HttpClient', {
    HttpClient: function () {
        return {
            get: function (url: string, headers: any) {
                return "";
            }
        }
    }
});

mockery.registerMock('azure-pipelines-task-lib/task', {
    osType: function () { return process.env["__ostype__"]; },
    which: function (tool: string, check: boolean) {
        if (tool == 'powershell') {
            return "C:/Program Files/PowerShell";
        }
        else if (tool.endsWith(".sh")) {
            return "/temp/somefile.sh";
        }
    },
    tool: function (pathToTool: string, args: string[], options: any) {
        if (process.env["__ostype__"]!.toLowerCase().includes("win")) {
            if (process.env["__getmachineosfail__"] == "true") {
                return new toolrunner(pathToTool, {code: 1, error: null, stderr: "failedWhileExecutingScript"});
            }

            return new toolrunner(pathToTool, {
                code: 0,
                error: null,
                stderr: "",
                stdout: `Primary:win-x64${os.EOL}Legacy:win-x64`
            });
        }
        else if (process.env["__ostype__"]!.toLowerCase().includes("linux")) {
            return new toolrunner(pathToTool, {
                code: 0,
                error: null,
                stderr: "",
                stdout: `Primary:linux-x64${os.EOL}Legacy:ubuntu16.04`
            });
        }
        else if (process.env["__ostype__"]!.toLowerCase().includes("osx")) {
            return new toolrunner(pathToTool, {
                code: 0,
                error: null,
                stderr: "",
                stdout: `Primary:osx-x64${os.EOL}Legacy:osx-x64`
            });
        }
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

import { DotNetCoreVersionFetcher } from "../src/versionfetcher";
import { VersionInfo } from '../src/models';

let versionFetcher = new DotNetCoreVersionFetcher();
try {
    let versionInfo = new VersionInfo(JSON.parse(process.env["__versioninfo__"]!), "sdk");
    let downloadUrl = versionFetcher.getDownloadUrl(versionInfo);
    if (downloadUrl) {
        tl.setResult(tl.TaskResult.Succeeded, "succeeded");
    }

    tl.setResult(tl.TaskResult.Failed, "DownloadUrlWasNotReturned");
}
catch (ex) {
    tl.setResult(tl.TaskResult.Failed, "TestThrewException" + ex);
}