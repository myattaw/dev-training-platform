// Reference solution. Private: used only to prove the tests are correct.
final class LRUCache {
    /// A node of a doubly linked list, most recently used first.
    private final class Node {
        let key: Int
        var value: Int
        weak var previous: Node?
        var next: Node?

        init(key: Int, value: Int) {
            self.key = key
            self.value = value
        }
    }

    private let capacity: Int
    private var nodes: [Int: Node] = [:]
    // Sentinels: head.next is the most recently used node, tail.previous the least.
    private let head = Node(key: 0, value: 0)
    private let tail = Node(key: 0, value: 0)

    init(capacity: Int) {
        self.capacity = capacity
        head.next = tail
        tail.previous = head
    }

    func get(_ key: Int) -> Int {
        guard let node = nodes[key] else { return -1 }
        moveToFront(node)
        return node.value
    }

    func put(_ key: Int, _ value: Int) {
        if let node = nodes[key] {
            node.value = value
            moveToFront(node)
            return
        }
        let node = Node(key: key, value: value)
        nodes[key] = node
        insertAtFront(node)
        if nodes.count > capacity, let oldest = tail.previous {
            unlink(oldest)
            nodes[oldest.key] = nil
        }
    }

    private func moveToFront(_ node: Node) {
        unlink(node)
        insertAtFront(node)
    }

    private func insertAtFront(_ node: Node) {
        node.previous = head
        node.next = head.next
        head.next?.previous = node
        head.next = node
    }

    private func unlink(_ node: Node) {
        node.previous?.next = node.next
        node.next?.previous = node.previous
    }
}
