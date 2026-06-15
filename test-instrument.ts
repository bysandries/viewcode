import { instrumentJava } from "./lib/instrument";

const code = `public class BST {
    private IntTreeNode root;

    public BST(int x) {
        root = new IntTreeNode(x);
    }

    public void insert(int x) {
        root = insertRec(root, x);
    }

    private IntTreeNode insertRec(IntTreeNode root, int x) {
        if (root == null) {
            return new IntTreeNode(x);
        }
        if (x < root.data) {
            root.left = insertRec(root.left, x);
        } else if (x > root.data) {
            root.right = insertRec(root.right, x);
        }
        return root;
    }

    public int height() {
        return height(root);
    }

    private int height(IntTreeNode node) {
        if (node == null) {
            return -1;
        }
        int leftHeight = height(node.left);
        int rightHeight = height(node.right);
        return 1 + Math.max(leftHeight, rightHeight);
    }

    private static class IntTreeNode {
        private int data;
        private IntTreeNode left;
        private IntTreeNode right;

        public IntTreeNode(int x) {
            data = x;
        }
    }

    // A 5-node main method to push the visualizer safely
    public static void main(String[] args) {
        BST tree = new BST(50); 
        
        // Creating an unbalanced left-heavy tree for deeper recursion
        tree.insert(30);        
        tree.insert(20);
        tree.insert(10);
        
        // One node on the right
        tree.insert(70);        

        int h = tree.height();
    }
}`;

console.log(instrumentJava(code));
