public class BST {
    private IntTreeNode root;

    public BST(int x) { TreeVisualizer.stackVars.put("x", x);
        root = new IntTreeNode(x); TreeVisualizer.stackVars.put("x", x); TreeVisualizer.stackVars.put("root", root); TreeVisualizer.show(5);
    }

    public void insert(int x) { TreeVisualizer.stackVars.put("x", x);
        root = insertRec(root, x); TreeVisualizer.stackVars.put("x", x); TreeVisualizer.stackVars.put("root", root); TreeVisualizer.show(9);
    }

    private IntTreeNode insertRec(IntTreeNode root, int x) { TreeVisualizer.stackVars.put("root", root); TreeVisualizer.stackVars.put("x", x);
        if (root == null) {
            return new IntTreeNode(x);
        }
        if (x < root.data) {
            root.left = insertRec(root.left, x); TreeVisualizer.stackVars.put("root", root); TreeVisualizer.stackVars.put("x", x); TreeVisualizer.show(17);
        } else if (x > root.data) {
            root.right = insertRec(root.right, x); TreeVisualizer.stackVars.put("root", root); TreeVisualizer.stackVars.put("x", x); TreeVisualizer.show(19);
        }
        return root;
    }

    public int height() {
        return height(root);
    }

    private int height(IntTreeNode node) { TreeVisualizer.stackVars.put("node", node);
        if (node == null) {
            return -1;
        }
        int leftHeight = height(node.left); TreeVisualizer.stackVars.put("node", node); TreeVisualizer.stackVars.put("leftHeight", leftHeight); TreeVisualizer.show(32);
        int rightHeight = height(node.right); TreeVisualizer.stackVars.put("node", node); TreeVisualizer.stackVars.put("leftHeight", leftHeight); TreeVisualizer.stackVars.put("rightHeight", rightHeight); TreeVisualizer.show(33);
        return 1 + Math.max(leftHeight, rightHeight);
    }

    private static class IntTreeNode {
        private int data;
        private IntTreeNode left;
        private IntTreeNode right;

        public IntTreeNode(int x) { TreeVisualizer.stackVars.put("x", x);
            data = x; TreeVisualizer.stackVars.put("x", x); TreeVisualizer.stackVars.put("data", data); TreeVisualizer.show(43);
        }
    }

    // A 5-node main method to push the visualizer safely
    public static void main(String[] args) {
        BST tree = new BST(50);  TreeVisualizer.stackVars.put("tree", tree); TreeVisualizer.show(49);
        
        // Creating an unbalanced left-heavy tree for deeper recursion
        tree.insert(30);         TreeVisualizer.stackVars.put("tree", tree); TreeVisualizer.show(52);
        tree.insert(20); TreeVisualizer.stackVars.put("tree", tree); TreeVisualizer.show(53);
        tree.insert(10); TreeVisualizer.stackVars.put("tree", tree); TreeVisualizer.show(54);
        
        // One node on the right
        tree.insert(70);         TreeVisualizer.stackVars.put("tree", tree); TreeVisualizer.show(57);

        int h = tree.height(); TreeVisualizer.stackVars.put("tree", tree); TreeVisualizer.stackVars.put("h", h); TreeVisualizer.show(59);
    }
}
