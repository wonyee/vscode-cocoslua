'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { languages } from 'vscode';

import { LuaSymbolProvider }          from './luaSymbol';
import { LuaWorkspaceSymbolProvider } from './luaWorkspaceSymbols';
import { LuaCompletionProvider }      from './luaAutocomplete';
import { LuaDefinitionProvider }      from './luaDefinition';
//var fileWatcher: vscode.FileSystemWatcher;

const LUA_MODE: vscode.DocumentFilter = { language: 'lua', scheme: 'file' };
export let diagnosticCollection: vscode.DiagnosticCollection;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "orionlua" is now active!');

    // workspace
    let workspaceProvider = new LuaWorkspaceSymbolProvider(/*LUA_MODE*/);
    vscode.workspace.onDidChangeTextDocument((ev: vscode.TextDocumentChangeEvent) => {
      if (vscode.window.activeTextEditor){
        if (ev.contentChanges.length > 0 &&
          ev.document.languageId === LUA_MODE.language &&
          ev.document.uri.scheme === LUA_MODE.scheme
        ) {
          diagnosticCollection.clear();
          workspaceProvider.update(ev.document);
        }
      }
    });
    context.subscriptions.push(languages.registerWorkspaceSymbolProvider(workspaceProvider));

    // providers
    context.subscriptions.push(languages.registerDocumentSymbolProvider(LUA_MODE,new LuaSymbolProvider()));
    context.subscriptions.push(languages.registerCompletionItemProvider(LUA_MODE,new LuaCompletionProvider(),'.',':'));
    context.subscriptions.push(languages.registerDefinitionProvider(LUA_MODE, new LuaDefinitionProvider()));
    diagnosticCollection = languages.createDiagnosticCollection('lua');
    context.subscriptions.push(diagnosticCollection);

    console.log(context.extensionPath);
}

// this method is called when your extension is deactivated
export function deactivate() {
}