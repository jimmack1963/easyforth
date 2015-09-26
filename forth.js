var FALSE = 0;
var TRUE = -1;

function controlCode(code) {
  return {
    isControlCode: true,
    code: code
  };
}

function StackUnderflowError() {
  this.message = "Stack underflow";
}

function EndOfInputError() {
  this.message = "nextToken called with no more tokens";
}

function MissingWordError(word) {
  this.message = word + " ? ";
}

function isNumber(val) {
  return +val + "" === val;
}

function invalidWord(word) {
  if (word !== ";") { // Can safely skip ;
    throw new MissingWordError(word);
  }
}

// Convert value to string, but undefined to ""
function getString(output) {
  if (output === undefined) {
    return "";
  } else {
    return "" + output;
  }
}


function Stack() {
  var arr = [];

  return {
    push: function (item) {
      arr.push(item);
    },
    pop: function () {
      if (arr.length > 0) {
        return arr.pop();
      } else {
        throw new StackUnderflowError();
      }
    },
    print: function () {
      return arr.join(" ") + " <- Top ";
    }
  };
}

function Dictionary() {
  // The dict is searched from beginning to end, so new definitions
  // need to be unshifted. This is usually a linked list, but meh
  var dict = [];

  function add(word, definition) {
    dict.unshift([word.toLowerCase(), definition]);
  }

  // Missing key returns null
  function lookup(key) {
    key = key.toLowerCase();
    var item = dict.find(function (item) {
      return item[0] === key;
    });

    if (item === undefined) {
      return null;
    } else {
      return item[1];
    }
  }

  return {
    add: add,
    lookup: lookup
  };
}

function Tokenizer(input) {
  var index = 0;
  var length = input.length;
  var stringMode = false;
  var whitespace = /\s+/;
  var validToken = /\S+/;
  var definitionStart = /^\s*:/;
  var definitionEnd = /;\s*$/;

  function hasMore() {
    // Is there any non-whitespace remaining in the input?
    return !!input.slice(index).match(validToken);
  }

  function isDefinitionStart() {
    return input.match(definitionStart);
  }

  function isDefinitionEnd() {
    return input.match(definitionEnd);
  }

  function skipWhitespace() {
    // Skip over leading whitespace
    while (whitespace.test(input[index]) && index < length) {
      index++;
    }
  }

  // Does input have these tokens at this index?
  function hasTokens(tokens, startIndex) {
    for (var i = 0; i < tokens.length; i++) {
      if (input[startIndex + i] != tokens[i]) {
        return false;
      }
    }
    return true;
  }

  function nextToken() {
    skipWhitespace();
    var isString = hasTokens('." ', index);
    var isParenComment = hasTokens('( ', index);

    var token = "";
    if (isString) {
      index += 3; // skip over ." and space
      while (input[index] !== '"' && index < length) {
        token += input[index];
        index++;
      }
      index++; // skip over final "
    } else if (isParenComment) {
      index += 2; // skip over ( and space
      while (input[index] !== ')' && index < length) {
        index++;
      }

      index++; // skip over final )
      return nextToken(); // ignore this token and return the next one
    } else {
      while (validToken.test(input[index]) && index < length) {
        token += input[index];
        index++;
      }
    }

    if (!token) {
      throw new EndOfInputError();
    }

    var returnObject = {
      token: token,
      string: isString
    };

    return returnObject;
  }

  return {
    hasMore: hasMore,
    nextToken: nextToken,
    isDefinitionStart: isDefinitionStart,
    isDefinitionEnd: isDefinitionEnd
  };
}

function Definition(name, dictionary) {
  var toExecute = [];

  // This is currently copied from Forth so don't do that
  function addWord(token) {
    var definition = dictionary.lookup(token.token);
    var word = token.token;

    if (definition !== null) {
      if (definition.isControlCode) {
        toExecute.push(definition);
      } else {
        toExecute.push(function (stack, dictionary) {
          return definition(stack, dictionary);
        });
      }
    } else if (isNumber(word)) {
      toExecute.push(function (stack, dictionary) {
        stack.push(+word);
      });
    } else if (token.string) {
      toExecute.push(function (stack, dictionary) {
        return word;
      });
    } else {
      invalidWord(word);
    }
  }

  function shouldExecute(context) {
    context = context || {};
    return !context.inConditional ||
      (context.parentShouldExecute &&
        (context.trueCondition === context.inIf));

  }

  function compile() {
    dictionary.add(name, function (stack, dictionary) {
      var controlStack = []; // used for keeping track of control structures
      controlStack.peek = function () {
        return this[this.length - 1];
      };

      var output = "";

      toExecute.forEach(function (action) {
        if (action.isControlCode) {
          switch (action.code) {
            case "if":
              var parentShouldExecute = shouldExecute(controlStack.peek());
              // keep track of if we're in a non-executing outer scope.
              // if so, don't pop the stack
              controlStack.push({
                parentShouldExecute: parentShouldExecute,
                inConditional: true,
                inIf: true,
                trueCondition: parentShouldExecute && stack.pop() !== FALSE
              });
              break;
            case "else":
              controlStack.peek().inIf = false;
              break;
            case "then":
              controlStack.pop();
              break;
          }
        } else {
          // Execute if not in a conditional or in the if part when true
          // or in the else part when false
          if (shouldExecute(controlStack.peek())) {
            var result = action(stack, dictionary);
            output += getString(result);
          }
        }
      });
      return output;
    });
  }

  return {
    addWord: addWord,
    compile: compile
  };
}

function Forth() {
  var inDefinition = false;
  var currentDefinition = null;
  var stack = Stack();
  var dictionary = Dictionary();

  function startDefinition() {
    inDefinition = true;
  }

  function endDefinition() {
    inDefinition = false;
  }

  function processWord(token) {
    if (token.string) {
      return "";
    }

    var word = token.token;

    var definition = dictionary.lookup(word);

    if (definition !== null) {
      return getString(definition(stack, dictionary));
    } else if (isNumber(word)) {
      stack.push(+word);
    } else {
      invalidWord(word);
    }

    return "";
  }

  function readLine(line) {
    var tokenizer = Tokenizer(line);

    if (tokenizer.isDefinitionStart()) {
      startDefinition();
      tokenizer.nextToken(); // drop :
      var definitionName = tokenizer.nextToken().token;
      currentDefinition = new Definition(definitionName, dictionary);
    }

    // The duplication between this case and the other is pretty bad
    if (inDefinition) {
      while (tokenizer.hasMore()) {
        try {
          currentDefinition.addWord(tokenizer.nextToken());
        } catch (e) {
          if (e instanceof EndOfInputError || e instanceof MissingWordError) {
            endDefinition();
            currentDefinition = null;
            return " " + e.message;
          } else {
            throw e;
          }
        }
      }

      if (tokenizer.isDefinitionEnd()) {
        endDefinition();
        currentDefinition.compile();
        return "  ok";
      }
    } else {
      var output = "";

      while (tokenizer.hasMore()) {
        try {
          output += processWord(tokenizer.nextToken());
        } catch (e) {
          if (e instanceof EndOfInputError || e instanceof MissingWordError || e instanceof StackUnderflowError) {
            return " " + e.message;
          } else {
            throw e;
          }
        }
      }

      return " " + output + " ok";
    }

    return "";
  }


  dictionary.add(".",  function (stack, dictionary) {
    return stack.pop() + " ";
  });

  dictionary.add(".s", function (stack, dictionary) {
    return "\n" + stack.print();
  });

  dictionary.add("+", function (stack, dictionary) {
    stack.push(stack.pop() + stack.pop());
  });

  dictionary.add("*", function (stack, dictionary) {
    stack.push(stack.pop() * stack.pop());
  });

  dictionary.add("/", function (stack, dictionary) {
    var a = stack.pop(), b = stack.pop();
    stack.push(Math.floor(b / a));
  });

  dictionary.add("/mod", function (stack, dictionary) {
    var a = stack.pop(), b = stack.pop();
    stack.push(Math.floor(b % a));
    stack.push(Math.floor(b / a));
  });

  dictionary.add("mod", function (stack, dictionary) {
    var a = stack.pop(), b = stack.pop();
    stack.push(Math.floor(b % a));
  });

  dictionary.add("=", function (stack, dictionary) {
    stack.push(stack.pop() === stack.pop() ? TRUE : FALSE);
  });

  dictionary.add("<", function (stack, dictionary) {
    var a = stack.pop(), b = stack.pop();
    stack.push(b < a ? TRUE : FALSE);
  });

  dictionary.add(">", function (stack, dictionary) {
    var a = stack.pop(), b = stack.pop();
    stack.push(b > a ? TRUE : FALSE);
  });

  dictionary.add("emit", function (stack, dictionary) {
    return String.fromCharCode(stack.pop());
  });

  dictionary.add("swap", function (stack, dictionary) {
    var a = stack.pop(), b = stack.pop();
    stack.push(a);
    stack.push(b);
  });

  dictionary.add("dup", function (stack, dictionary) {
    var a = stack.pop();
    stack.push(a);
    stack.push(a);
  });

  dictionary.add("over", function (stack, dictionary) {
    var a = stack.pop(), b = stack.pop();
    stack.push(b);
    stack.push(a);
    stack.push(b);
  });

  dictionary.add("rot", function (stack, dictionary) {
    var a = stack.pop(), b = stack.pop(), c = stack.pop();
    stack.push(b);
    stack.push(a);
    stack.push(c);
  });

  dictionary.add("drop", function (stack, dictionary) {
    stack.pop();
  });

  dictionary.add("if", controlCode("if"));
  dictionary.add("else", controlCode("else"));
  dictionary.add("then", controlCode("then"));

  readLine(": cr 10 emit ;");

  readLine(": space 32 emit ;");

  // can implement this as a readLine when we have loops
  dictionary.add("spaces", function (stack, dictionary) {
    return new Array(stack.pop() + 1).join(" ");
  });

  return {
    readLine: readLine,
    getStack: function () {
      return stack.print();
    }
  };
}
