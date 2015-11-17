'use strict';

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; })();

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (_ref) {
  var t = _ref.types;

  var depthKey = '__reactTransformDepth';
  var recordsKey = '__reactTransformRecords';
  var wrapComponentIdKey = '__reactTransformWrapComponentId';
  var optionsKey = '__reactTransformOptions';
  var cacheKey = '__reactTransformCache';

  function isRenderMethod(member) {
    return member.kind === 'method' && member.key.name === 'render';
  }

  /**
   * Does this class have a render function?
   */
  function isComponentishClass(cls) {
    return cls.body.body.filter(isRenderMethod).length > 0;
  }

  function buildIsCreateClassCallExpression(factoryMethods) {
    var matchMemberExpressions = {};

    factoryMethods.forEach(function (method) {
      matchMemberExpressions[method] = t.buildMatchMemberExpression(method);
    });

    return function (node) {
      for (var i = 0; i < factoryMethods.length; i++) {
        var method = factoryMethods[i];
        if (method.indexOf('.') !== -1) {
          if (matchMemberExpressions[method](node.callee)) {
            return true;
          }
        } else {
          if (node.callee.name === method) {
            return true;
          }
        }
      }
    };
  }

  /**
   * Does this node look like a createClass() call?
   */
  function isCreateClass(node, isCreateClassCallExpression) {
    if (!node || !t.isCallExpression(node)) {
      return false;
    }
    if (!isCreateClassCallExpression(node)) {
      return false;
    }
    var args = node.arguments;
    if (args.length !== 1) {
      return false;
    }
    var first = args[0];
    return t.isObjectExpression(first);
  }

  /**
   * Infers a displayName from either a class node, or a createClass() call node.
   */
  function findDisplayName(node) {
    if (node.id) {
      return node.id.name;
    }
    if (!node.arguments) {
      return;
    }
    var props = node.arguments[0].properties;
    for (var i = 0; i < props.length; i++) {
      var prop = props[i];
      var key = t.toComputedKey(prop);
      if (t.isLiteral(key, { value: 'displayName' })) {
        return prop.value.value;
      }
    }
  }

  function isValidOptions(options) {
    return (typeof options === 'undefined' ? 'undefined' : _typeof(options)) === 'object' && Array.isArray(options.transforms);
  }

  /**
   * Creates a record about us having visited a valid React component.
   * Such records will later be merged into a single object.
   */
  function createComponentRecord(node, scope, state) {
    var displayName = findDisplayName(node) || undefined;
    var uniqueId = scope.generateUidIdentifier('$' + (displayName || 'Unknown')).name;

    var props = [];
    if (typeof displayName === 'string') {
      props.push(t.objectProperty(t.identifier('displayName'), t.stringLiteral(displayName)));
    }
    if (state[depthKey] > 0) {
      props.push(t.objectProperty(t.identifier('isInFunction'), t.booleanLiteral(true)));
    }

    return [uniqueId, t.objectExpression(props)];
  }

  /**
   * Memorizes the fact that we have visited a valid component in the plugin state.
   * We will later retrieve memorized records to compose an object out of them.
   */
  function addComponentRecord(node, scope, state) {
    var _createComponentRecor = createComponentRecord(node, scope, state);

    var _createComponentRecor2 = _slicedToArray(_createComponentRecor, 2);

    var uniqueId = _createComponentRecor2[0];
    var definition = _createComponentRecor2[1];

    state[recordsKey] = state[recordsKey] || [];
    state[recordsKey].push(t.objectProperty(t.identifier(uniqueId), definition));
    return uniqueId;
  }

  /**
   * Have we visited any components so far?
   */
  function foundComponentRecords(state) {
    var records = state[recordsKey];
    return records && records.length > 0;
  }

  /**
   * Turns all component records recorded so far, into a variable.
   */
  function defineComponentRecords(scope, state) {
    var records = state[recordsKey];
    state[recordsKey] = [];

    var id = scope.generateUidIdentifier('components');
    return [id, t.variableDeclaration('var', [t.variableDeclarator(id, t.objectExpression(records))])];
  }

  /**
   * Imports and calls a particular transformation target function.
   * You may specify several such transformations, so they are handled separately.
   */
  function defineInitTransformCall(scope, file, recordsId, targetOptions) {
    var id = scope.generateUidIdentifier('reactComponentWrapper');
    var transform = targetOptions.transform;
    var _targetOptions$import = targetOptions.imports;
    var imports = _targetOptions$import === undefined ? [] : _targetOptions$import;
    var _targetOptions$locals = targetOptions.locals;
    var locals = _targetOptions$locals === undefined ? [] : _targetOptions$locals;
    var filename = file.opts.filename;

    return [id, t.variableDeclaration('var', [t.variableDeclarator(id, t.callExpression(file.addImport(transform, 'default'), [t.objectExpression([t.objectProperty(t.identifier('filename'), t.stringLiteral(filename)), t.objectProperty(t.identifier('components'), recordsId), t.objectProperty(t.identifier('locals'), t.arrayExpression(locals.map(function (local) {
      return t.identifier(local);
    }))), t.objectProperty(t.identifier('imports'), t.arrayExpression(imports.map(function (imp) {
      return file.addImport(imp, 'default', 'absolute');
    })))])]))])];
  }

  /**
   * Defines the function that calls every transform.
   * This is the function every component will be wrapped with.
   */
  function defineWrapComponent(wrapComponentId, initTransformIds) {
    return t.functionDeclaration(wrapComponentId, [t.identifier('uniqueId')], t.blockStatement([t.returnStatement(t.functionExpression(null, [t.identifier('ReactClass')], t.blockStatement([t.returnStatement(initTransformIds.reduce(function (composed, initTransformId) {
      return t.callExpression(initTransformId, [composed, t.identifier('uniqueId')]);
    }, t.identifier('ReactClass')))])))]));
  }

  return {
    visitor: {
      'FunctionDeclaration|FunctionExpression': {
        enter: function enter(_ref2) {
          var node = _ref2.node;
          var parent = _ref2.parent;
          var scope = _ref2.scope;

          if (!this.state[depthKey]) {
            this.state[depthKey] = 0;
          }
          this.state[depthKey]++;
        },
        exit: function exit(_ref3) {
          var node = _ref3.node;
          var parent = _ref3.parent;
          var scope = _ref3.scope;

          this.state[depthKey]--;
        }
      },

      ClassExpression: function ClassExpression(path) {
        var node = path.node;
        var scope = path.scope;

        if (!isComponentishClass(node) || node._reactTransformWrapped) {
          return;
        }

        var wrapReactComponentId = this.state[wrapComponentIdKey];
        var uniqueId = addComponentRecord(node, scope, this.state);
        node._reactTransformWrapped = true;
        var ref = scope.generateUidIdentifierBasedOnNode(node.id);

        path.replaceWithMultiple([buildWrappedClass({
          CLASS: node,
          CLASS_REF: ref,
          DECORATOR: t.callExpression(wrapReactComponentId, [t.stringLiteral(uniqueId)])
        })]);
      },

      CallExpression: {
        exit: function exit(path) {
          var node = path.node;
          var scope = path.scope;
          var isCreateClassCallExpression = this.state[cacheKey].isCreateClassCallExpression;

          if (!isCreateClass(node, isCreateClassCallExpression) || node._reactTransformWrapped) {
            return;
          }

          var wrapReactComponentId = this.state[wrapComponentIdKey];
          var uniqueId = addComponentRecord(node, scope, this.state);
          node._reactTransformWrapped = true;

          path.replaceWith(t.callExpression(t.callExpression(wrapReactComponentId, [t.stringLiteral(uniqueId)]), [node]));
        }
      },

      Program: {
        enter: function enter(_ref4, state) {
          var scope = _ref4.scope;
          var opts = state.opts;

          if (!isValidOptions(opts)) {
            throw new Error('babel-plugin-react-transform requires that you specify options in .babelrc ' + 'or in your Babel Node API call options, and that it is an object with ' + 'a transforms property which is an array.');
          }
          var factoryMethods = opts.factoryMethods || ['React.createClass', 'createClass'];

          this.state = {};
          this.state[optionsKey] = opts;
          this.state[cacheKey] = {
            isCreateClassCallExpression: buildIsCreateClassCallExpression(factoryMethods)
          };

          this.state[wrapComponentIdKey] = scope.generateUidIdentifier('wrapComponent');
        },
        exit: function exit(path) {
          var node = path.node;
          var scope = path.scope;
          var file = path.hub.file;

          if (!foundComponentRecords(this.state)) {
            return;
          }

          // Generate a variable holding component records
          var allTransforms = this.state[optionsKey].transforms;

          var _defineComponentRecor = defineComponentRecords(scope, this.state);

          var _defineComponentRecor2 = _slicedToArray(_defineComponentRecor, 2);

          var recordsId = _defineComponentRecor2[0];
          var recordsVar = _defineComponentRecor2[1];

          // Import transformation functions and initialize them

          var initTransformCalls = allTransforms.map(function (transformOptions) {
            return defineInitTransformCall(scope, file, recordsId, transformOptions);
          }).filter(Boolean);
          var initTransformIds = initTransformCalls.map(function (c) {
            return c[0];
          });
          var initTransformVars = initTransformCalls.map(function (c) {
            return c[1];
          });

          // Create one uber function calling each transformation
          var wrapComponentId = this.state[wrapComponentIdKey];
          var wrapComponent = defineWrapComponent(wrapComponentId, initTransformIds);
          path.replaceWith(t.program([recordsVar].concat(_toConsumableArray(initTransformVars), [wrapComponent], _toConsumableArray(node.body))));
        }
      }
    }
  };
};

var _babelTemplate = require('babel-template');

var _babelTemplate2 = _interopRequireDefault(_babelTemplate);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } }

function _typeof(obj) { return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj; }

var buildWrappedClass = (0, _babelTemplate2.default)('\n  (function(){ var CLASS_REF = CLASS; return DECORATOR(CLASS_REF) || CLASS_REF; })()\n');