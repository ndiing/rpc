const isObject = (any) => toString.call(any) === "[object Object]";
exports.isObject = isObject;

const isArray = (any) => toString.call(any) === "[object Array]";
exports.isArray = isArray;
