const fs = require('fs');

const CONTROL_START = /^(if|else|for|while|do|switch|case|default|try|catch|finally|synchronized|return|new)\b/;
const TERMINAL_STMT = /^(break|continue|return|throw)\b/;
const DECL_RE = /^(?:final\s+)?[A-Za-z_$][\w$.]*\s*(?:<[^=]*>)?\s*(?:\[\s*\]\s*)*\s+([A-Za-z_$][\w$]*)\s*=(?!=)/;
const BARE_ASSIGN_RE = /^([A-Za-z_$][\w$]*)\s*(?:[+\-*/%&|^]|<<|>>>?)?=(?!=)/;
const FOR_DECL_RE = /^for\s*\(\s*(?:final\s+)?[A-Za-z_$][\w$.]*\s*(?:<[^=:;]*>)?\s*(?:\[\s*\]\s*)*\s+([A-Za-z_$][\w$]*)\s*[:=]/;

function instrumentJava(code) {
  const lines = code.split("\n")
  let depth = 0
  let inMethod = false
  let methodBodyDepth = 0
  let liveVars = []

  const register = (name, d) => {
    if (!liveVars.some((v) => v.name === name)) liveVars.push({ name, depth: d })
  }

  const nextLineIsElse = (idx) => {
    for (let i = idx + 1; i < lines.length; i++) {
      const t = lines[i].trim()
      if (!t || t.startsWith("//")) continue
      return /^(\}\s*)*else\b/.test(t)
    }
    return false
  }

  return lines
    .map((line, idx) => {
      const trimmed = line.trim()
      const open = (line.match(/\{/g) || []).length
      const close = (line.match(/\}/g) || []).length
      const depthBefore = depth
      const depthAfter = depthBefore + open - close
      const keepDepth = Math.min(depthAfter, depthBefore - close)
      depth = depthAfter

      liveVars = liveVars.filter((v) => v.depth <= keepDepth)
      if (inMethod && keepDepth < methodBodyDepth) inMethod = false

      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return line

      if (!inMethod) {
        const isSignature =
          depthBefore >= 1 &&
          open > close &&
          /\([^;]*\)\s*\{/.test(line) &&
          !/\b(class|interface|enum|record)\b/.test(line) &&
          !CONTROL_START.test(trimmed)
        if (!isSignature) return line

        inMethod = true
        methodBodyDepth = depthBefore + 1

        const paren = line.match(/\(([^)]*)\)/)
        let injected = ""
        if (paren && paren[1].trim()) {
          let params = paren[1]
          while (/<[^<>]*>/.test(params)) params = params.replace(/<[^<>]*>/g, "")
          for (const p of params.split(",")) {
            const m = p.trim().match(/([A-Za-z_$][\w$]*)\s*$/)
            if (!m || m[1] === "args") continue
            register(m[1], methodBodyDepth)
            injected += ` TreeVisualizer.stackVars.put("${m[1]}", ${m[1]});`
          }
        }
        return line + injected
      }

      if (trimmed.includes("TreeVisualizer.")) return line

      if (trimmed.startsWith("for")) {
        const m = trimmed.match(FOR_DECL_RE)
        if (m && open > close) register(m[1], depthAfter)
        return line
      }

      const decl = trimmed.match(DECL_RE)
      if (decl) {
        register(decl[1], depthAfter)
      } else {
        const bare = trimmed.match(BARE_ASSIGN_RE)
        if (bare && !CONTROL_START.test(bare[1]) && !TERMINAL_STMT.test(bare[1])) register(bare[1], depthAfter)
      }

      if (!trimmed.endsWith(";")) return line

      const lastStmt = trimmed.replace(/;\s*$/, "").split(";").pop().trim()
      if (TERMINAL_STMT.test(lastStmt)) return line

      if (/^(if|else)\b/.test(trimmed) && nextLineIsElse(idx)) return line

      const names = []
      for (const v of liveVars) if (!names.includes(v.name)) names.push(v.name)
      const puts = names.map((n) => ` TreeVisualizer.stackVars.put("${n}", ${n});`).join("")
      return line + puts + ` TreeVisualizer.show(${idx + 1});`
    })
    .join("\n")
}

const javaCode = `
public class BST {
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

    // MINIMAL main method to prevent visualizer timeout
    public static void main(String[] args) {
        BST tree = new BST(50); // Root
        
        tree.insert(30);        // Left child
        tree.insert(70);        // Right child

        // Trigger height calculation
        int h = tree.height();
    }
}
`;

fs.writeFileSync("BST.java", instrumentJava(javaCode));
