import * as vscode from 'vscode';

import { Range, SymbolInformation, SymbolKind, TextDocument, CancellationToken, Uri } from 'vscode';
import { diagnosticCollection } from './extension';
import { LuaWorkspaceSymbolProvider } from './luaWorkspaceSymbols';

export class SymbolInfoEx extends SymbolInformation {
  detail: string;
  // constructor(name: string, kind: SymbolKind, containerName: string, location: Location, dt? : string){
  //   super(name,kind,containerName,location);
  //   if (dt) {this.detail = dt;}
  //   else {this.detail = "";}
  // };
  constructor(name: string, kind: SymbolKind, range: Range, uri?: Uri, containerName?: string, dt?: string) {
    super(name, kind, range, uri, containerName);
    if (dt) { this.detail = dt; }
    else { this.detail = ""; }
  }
}

export class LuaSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols = (doc: TextDocument, token: CancellationToken) =>
    Promise.resolve(processDocument(doc))
}

export function processDocument(doc: TextDocument) {
  console.log(doc.uri.path);
  //type RangeAndText = [Range, string];
  const docRange = doc.validateRange(
    new Range(0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
  );

  let parser = require('luaparse');
  let symbolArr = Array<SymbolInfoEx>();
  let currScope: [string, number, number][];
  let anonymous_idx = 1;
  let classname = "@noclass";

  //new SymbolInformation(matches2[3], SymbolKind.Function, new Range(range.start, range.end))
  const docText = doc.getText(docRange);
  currScope = [];
  try {
    let sym = parser.parse(docText, { ranges: true });
    currScope.push(['', 0, Number.MAX_SAFE_INTEGER]);

    //helper functions
    function getScope(range: [number, number]) {
      for (let i = currScope.length - 1; i >= 0; i--) {
        let curs = currScope[i];
        if (curs[1] <= range[0] && curs[2] >= range[1]) {
          return curs[0];
        }
      }
      return "";
    }
    function getNames(obj: any, range?: [number, number]) {
      let name: string = '';
      let basename: string = '';
      if (obj.name) {
        name = obj.name;
      }
      else if (obj.identifier && obj.identifier.name) {
        name = obj.identifier.name;
      }
      if (obj.base && obj.base.name) {
        basename = obj.base.name;
      }
      else if (obj.base && obj.base.identifier && obj.base.identifier.name) {
        basename = obj.base.identifier.name;
      }
      if (basename === 'exports') {
        basename = 'global';
      }
      if (range && basename === "") { // 某些情况需要判断scope才能获取到正确的basename？
        basename = getScope(range);
      }
      return [name, basename];
    }
    function checkExist(names: string[]) {
      for (let sym of symbolArr) {
        if (sym.name === names[0] && sym.containerName === names[1]) {
          return true;
        }
      }
      return false;
    }
    /////////////////
    function parseRecursive(doc: TextDocument, body: any) {
      for (let s of body) {
        if (s.type === "LocalStatement") {
          let ls = s.variables;
          for (let v of ls) {
            if (v.type === "Identifier") {
              symbolArr.push(new SymbolInfoEx(v.name, SymbolKind.Variable,
                new Range(doc.positionAt(v.range[0]), doc.positionAt(v.range[1])),
                doc.uri, getScope(v.range)));
            }
          }
        }
        else if (s.type === "CallStatement") {
          let le = s.expression;
          if (le.arguments) { parseRecursive(doc, le.arguments); }
        }
        else if (s.type === "AssignmentStatement") {
          for (let asv of s.variables) {
            let names = getNames(asv, asv.range);
            if (names[0] !== "" && !checkExist(names)) {
              symbolArr.push(new SymbolInfoEx(names[0], SymbolKind.Variable,
                new Range(doc.positionAt(asv.range[0]), doc.positionAt(asv.range[1])),
                doc.uri, names[1]));
            }
          }
        }
        else if (s.type === "ClassDeclaration") {
          symbolArr.push(new SymbolInfoEx(s.identifier, SymbolKind.Class,
            new Range(doc.positionAt(s.range[0]), doc.positionAt(s.range[1])),
            doc.uri, s.base));
            classname = s.identifier;
        }
        else if (s.type === "FunctionDeclaration") {
          if (s.identifier) {
            let names = getNames(s.identifier, s.range);
            let detail: string = "";
            if (s.parameters) {
              detail = names[0] + "(";
              let idx = 1;
              for (let p of s.parameters) {
                if (idx > 1) { detail += ","; }
                detail += "${" + String(idx++) + ":" + p.name + "}";
              }
              detail += ")";
            }
            if (names[0] === "") {
              names[0] = '@anonymous'+String(anonymous_idx++);
            }
            let sk = SymbolKind.Function;
            if (names[1] === classname) {
              sk = SymbolKind.Method;
            }
            symbolArr.push(new SymbolInfoEx(names[0], sk,
              new Range(doc.positionAt(s.range[0]), doc.positionAt(s.range[1])),
              doc.uri, names[1], detail));
            currScope.push([names[0], s.range[0], s.range[1]]);
          }
          else {
            let name = '@anonymous'+String(anonymous_idx++);
            let base = getScope(s.range);
            let sk = SymbolKind.Function;
            if (base === classname) {
              sk = SymbolKind.Method;
            }
            symbolArr.push(new SymbolInfoEx(name, sk,
              new Range(doc.positionAt(s.range[0]), doc.positionAt(s.range[1])),
              doc.uri, base, ""));
            currScope.push([name, s.range[0], s.range[1]]);
          }
          if (s.parameters) {
            let par = s.parameters;
            for (let p of par) {
              if (p.type === "Identifier") {
                symbolArr.push(new SymbolInfoEx(p.name, SymbolKind.Field,
                  new Range(doc.positionAt(s.range[0]), doc.positionAt(s.range[1])), doc.uri, getScope(s.range)));
              }
            }
          }
        } // end of FunctionDeclaration
        else if (s.type === "IfStatement") {
          for (let cla of s.clauses) {
            if (cla.body) {
              parseRecursive(doc, cla.body);
            }
          }
        }
        else if (s.type === "ForGenericStatement") {
          let ls = s.variables;
          for (let v of ls) {
            if (v.type === "Identifier") {
              let names = getNames(v, v.range);
              if (names[0] !== '_') {
                symbolArr.push(new SymbolInfoEx(names[0], SymbolKind.Variable,
                  new Range(doc.positionAt(s.range[0]), doc.positionAt(s.range[1])),
                  doc.uri, names[1]));
              }
            }
          }
        }
        else if (s.type === "ForNumericStatement") {
          let v = s.variable;
          if (v.type === "Identifier") {
            let names = getNames(v, v.range);
            if (names[0] !== '_') {
              symbolArr.push(new SymbolInfoEx(names[0], SymbolKind.Variable,
                new Range(doc.positionAt(s.range[0]), doc.positionAt(s.range[1])),
                doc.uri, names[1]));
            }
          }
        }
        if (s.body) {
          parseRecursive(doc, s.body);
        }
      }
    }

    parseRecursive(doc, sym.body);

    if (LuaWorkspaceSymbolProvider._statusBarItem.text === "Error Parsing " + doc.uri.fsPath) {
      LuaWorkspaceSymbolProvider._statusBarItem.text = "Done Parsing";
      LuaWorkspaceSymbolProvider._statusBarItem.color = "white";
    }
  } catch (err) {
    if (!(err instanceof SyntaxError)) {
      console.log(err.message);
      throw err;
    }
    const match = err.message.match(/\[(\d+):(\d+)\]/);
    if (match) {
      let diag: vscode.Diagnostic;
      diag = new vscode.Diagnostic(new Range(new vscode.Position(+match[1] - 1, +match[2]),
        new vscode.Position(+match[1] - 1, +match[2] + 1)),
        err.message, vscode.DiagnosticSeverity.Error);
      diagnosticCollection.set(doc.uri, [diag]);
    }
    LuaWorkspaceSymbolProvider._statusBarItem.text = "Error Parsing " + doc.uri.fsPath;
    LuaWorkspaceSymbolProvider._statusBarItem.color = 'black';
  }
  return symbolArr;
}
