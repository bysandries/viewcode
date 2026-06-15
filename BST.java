
public class BST {
    private IntTreeNode root;

    public BST(int x) { TreeVisualizer.stackVars.put("x", x);
        root = new IntTreeNode(x); TreeVisualizer.stackVars.put("x", x); TreeVisualizer.stackVars.put("root", root); TreeVisualizer.show(6);
    }

    public void insert(int x) { TreeVisualizer.stackVars.put("x", x);
        root = insertRec(root, x); TreeVisualizer.stackVars.put("x", x); TreeVisualizer.stackVars.put("root", root); TreeVisualizer.show(10);
    }

    private IntTreeNode insertRec(IntTreeNode root, int x) { TreeVisualizer.stackVars.put("root", root); TreeVisualizer.stackVars.put("x", x);
        if (root == null) {
            return new IntTreeNode(x);
        }
        if (x < root.data) {
            root.left = insertRec(root.left, x); TreeVisualizer.stackVars.put("root", root); TreeVisualizer.stackVars.put("x", x); TreeVisualizer.show(18);
        } else if (x > root.data) {
            root.right = insertRec(root.right, x); TreeVisualizer.stackVars.put("root", root); TreeVisualizer.stackVars.put("x", x); TreeVisualizer.show(20);
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
        int leftHeight = height(node.left); TreeVisualizer.stackVars.put("node", node); TreeVisualizer.stackVars.put("leftHeight", leftHeight); TreeVisualizer.show(33);
        int rightHeight = height(node.right); TreeVisualizer.stackVars.put("node", node); TreeVisualizer.stackVars.put("leftHeight", leftHeight); TreeVisualizer.stackVars.put("rightHeight", rightHeight); TreeVisualizer.show(34);
        return 1 + Math.max(leftHeight, rightHeight);
    }

    private static class IntTreeNode {
        private int data;
        private IntTreeNode left;
        private IntTreeNode right;

        public IntTreeNode(int x) { TreeVisualizer.stackVars.put("x", x);
            data = x; TreeVisualizer.stackVars.put("x", x); TreeVisualizer.stackVars.put("data", data); TreeVisualizer.show(44);
        }
    }

    // MINIMAL main method to prevent visualizer timeout
    public static void main(String[] args) {
        BST tree = new BST(50); // Root
        
        tree.insert(30);        // Left child
        tree.insert(70);        // Right child

        // Trigger height calculation
        int h = tree.height(); TreeVisualizer.stackVars.put("tree", tree); TreeVisualizer.stackVars.put("h", h); TreeVisualizer.show(56);
    }
}
