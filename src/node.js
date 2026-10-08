class Node {
    constructor(segment) {
        this.segment = segment;

        this.handlers = [];

        this.children = new Map();
    }

    add(segment) {
        if (!this.children.has(segment)) {
            this.children.set(segment, new Node(segment));
        }

        return this.children.get(segment);
    }

    merge(node) {
        this.handlers.push(...node.handlers);

        for (const [segment, child] of node.children) {
            if (!this.children.has(segment)) {
                this.children.set(segment, child);
            } else {
                this.children.get(segment).merge(child);
            }
        }
    }
}
exports.Node = Node;
