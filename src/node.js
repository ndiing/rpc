class Node {
    constructor(segment) {
        this.segment = segment;
        /**@type {Map<string, Node>}*/
        this.children = new Map();
        /**@type {Map<string, FunctionHandler[]>}*/
        this.handlers = [];
    }

    add(segment) {
        if (!this.children.has(segment)) {
            this.children.set(segment, new Node(segment));
        }

        return this.children.get(segment);
    }

    /**
     * @param {Node} node
     * @param {Number} offset
     */
    merge(node, offset) {
        for (const handler of node.handlers) {
            handler.seq += offset;
            this.handlers.get(method).push(handler);
        }

        for (const [segment, child] of node.children) {
            if (!this.children.has(segment)) {
                child.setSeqOffset(offset);
                this.children.set(segment, child);
            } else {
                this.children.get(segment).merge(child, offset);
            }
        }
    }

    /**
     * @param {Number} offset
     */
    setSeqOffset(offset) {
        for (const handler of this.handlers) {
            handler.seq += offset;
        }

        for (const [, child] of this.children) {
            child.setSeqOffset(offset);
        }
    }

    getMaxSeq() {
        let max = -1;

        for (const handler of this.handlers) {
            max = Math.max(max, handler.seq);
        }

        for (const [, child] of this.children) {
            max = Math.max(max, child.getMaxSeq());
        }

        return max;
    }
}
exports.Node = Node;
