import * as vscode from 'vscode';

import { Range, SymbolInformation, SymbolKind, TextDocument, CancellationToken, Uri } from 'vscode';
import { diagnosticCollection } from './extension';
import { LuaWorkspaceSymbolProvider } from './luaWorkspaceSymbols';
import { getType } from './luaAutocomplete';

export class SymbolInfoEx extends SymbolInformation {
  detail: string = "";
  type: string = "";
  // constructor(name: string, kind: SymbolKind, containerName: string, location: Location, dt? : string){
  //   super(name,kind,containerName,location);
  //   if (dt) {this.detail = dt;}
  //   else {this.detail = "";}
  // };
  constructor(name: string, kind: SymbolKind, range: Range, uri?: Uri, containerName?: string, dt?: string, tp?: string) {
    super(name, kind, range, uri, containerName);
    if (dt) { this.detail = dt; }
    if (tp) { this.type = tp; }
  }
}

export class LuaSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols = (doc: TextDocument, token: CancellationToken) =>
    Promise.resolve(processDocument(doc))
}

function getFull(node: any, str: string) {
  if (node.base) {
    str = getFull(node.base, str);
  }
  if (node.indexer) {
    str += node.indexer;
  }
  if (node.name) {
    str += node.name;
  }
  else if (node.identifier) {
    str += node.identifier.name;
  }
  return str;
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
        //let pos = doc.positionAt(s.range[0]);
        //console.log("type:"+s.type+" line:"+pos.line);
        if (s.type === "LocalStatement") {
          let ls = s.variables;
          let idx = 0;
          for (let v of ls) {
            if (v.type === "Identifier") {
              let type = "";
              if (s.init) {
                if (s.init[idx]) {
                  // checktype
                  let str = "";
                  str = getFull(s.init[idx], str);
                  str = str.replace('.', ':');
                  let arr = str.split(':');
                  type = getType(arr);
                }
              }
              if (type !== "") {
                console.log("var:" + v.name + " type:" + type);
              }
              symbolArr.push(new SymbolInfoEx(v.name, SymbolKind.Variable,
                new Range(doc.positionAt(v.range[0]), doc.positionAt(v.range[1])),
                doc.uri, getScope(v.range), "", type));
            }
            idx++;
          }
        }
        else if (s.type === "TableConstructorExpression") {
          let table_name: string;
          if (symbolArr.length === 0) {
            table_name = '@anonymous' + String(anonymous_idx++);
          }
          else {
            let last_sym = symbolArr[symbolArr.length - 1];
            if (last_sym.location.range.contains(new vscode.Range(doc.positionAt(s.range[0]), doc.positionAt(s.range[1])))) {
              table_name = last_sym.name;
            }
            else {
              table_name = '@anonymous' + String(anonymous_idx++);
            }
          }
          currScope.push([table_name, s.range[0], s.range[1]]);
          for (let f of s.fields) {
            if (f.type === "TableKeyString") {
              let names = getNames(f.key, f.range);
              symbolArr.push(new SymbolInfoEx(names[0], SymbolKind.Variable,
                new Range(doc.positionAt(f.range[0]), doc.positionAt(f.range[1])),
                doc.uri, names[1]));
              if (f.value && f.value.body) {
                parseRecursive(doc, f.value.body);
              }
            }
          }
          currScope.pop();
        }
        else if (s.type === "CallStatement") {
          let le = s.expression;
          if (le.base && le.base.arguments) { parseRecursive(doc, le.base.arguments); }
          if (le.arguments) { parseRecursive(doc, le.arguments); }
        }
        else if (s.type === "AssignmentStatement") {
          let idx = 0;
          for (let asv of s.variables) {
            let type = "";
            if (s.init) {
              if (s.init[idx]) {
                // checktype
                let str = "";
                str = getFull(s.init[idx], str);
                str = str.replace('.', ':');
                let arr = str.split(':');
                type = getType(arr);
              }
            }

            let names = getNames(asv, asv.range);
            if (type !== "") {
              console.log("var:" + names[0] + " type:" + type);
            }
            if (names[0] !== "" && !checkExist(names)) {
              symbolArr.push(new SymbolInfoEx(names[0], SymbolKind.Variable,
                new Range(doc.positionAt(s.range[0]), doc.positionAt(s.range[1])),
                doc.uri, names[1], "", type));
            }
            idx++;
          }
          if (s.init) {
            parseRecursive(doc, s.init);
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
              names[0] = '@anonymous' + String(anonymous_idx++);
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
            let name = '@anonymous' + String(anonymous_idx++);
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
      console.error(err.message);
      console.error(err.stack);
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
