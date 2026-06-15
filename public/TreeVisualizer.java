import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Collection;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class TreeVisualizer {
    private static final String MARKER = "@@TREEVIZ@@";
    private static final int MAX_NODES = 2000;
    private static final int MAX_ENTRIES = 100;
    private static final String[] VALUE_NAMES = {
        "value", "val", "key", "keys", "data", "element", "elem",
        "item", "e", "info", "label", "name", "num", "id"
    };

    // Global stack frame (a single shared frame keeps instrumentation simple).
    public static Map<String, Object> stackVars = new LinkedHashMap<>();

    public static void show() {
        show(null, null);
    }

    public static void show(String bannerMsg) {
        show(null, bannerMsg);
    }

    // Called by the auto-instrumenter, which knows the editor line it appended to.
    // Stack traces are useless for this under CheerpJ (getLineNumber() returns 0).
    public static void show(int line) {
        emit(line, null, null);
    }

    public static void show(String color, String bannerMsg) {
        int line = -1;
        for (StackTraceElement e : Thread.currentThread().getStackTrace()) {
            String cName = e.getClassName();
            if (!cName.equals(TreeVisualizer.class.getName())
                && !cName.equals("java.lang.Thread")) {
                line = e.getLineNumber();
                break;
            }
        }
        emit(line, color, bannerMsg);
    }

    private static void emit(int line, String color, String bannerMsg) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"line\":").append(line);
        if (color != null) sb.append(",\"color\":\"").append(color).append("\"");
        if (bannerMsg != null) {
            sb.append(",\"bannerMsg\":");
            appendJsonString(sb, bannerMsg);
        }

        IdentityHashMap<Object, Boolean> seen = new IdentityHashMap<>();
        int[] budget = new int[] { MAX_NODES };
        StringBuilder heapSb = new StringBuilder();
        heapSb.append("{");

        // Extract static fields from any classes we encounter in the stack
        Map<String, Object> staticVars = new HashMap<>();
        Set<Class<?>> seenClasses = new HashSet<>();
        for (Object val : stackVars.values()) {
            if (val != null) {
                Class<?> cls = val.getClass();
                if (seenClasses.add(cls) && !cls.isArray() && !cls.getName().startsWith("java.")) {
                    for (Field f : cls.getDeclaredFields()) {
                        if (Modifier.isStatic(f.getModifiers()) && !f.isSynthetic()) {
                            try {
                                f.setAccessible(true);
                                staticVars.put(cls.getSimpleName() + "." + f.getName(), f.get(null));
                            } catch (Exception ignored) {}
                        }
                    }
                }
            }
        }

        StringBuilder stackSb = new StringBuilder();
        stackSb.append("{");

        boolean firstStack = true;
        boolean[] firstHeap = { true };

        // Merge locals and statics for stack output
        Map<String, Object> allStackVars = new LinkedHashMap<>(stackVars);
        allStackVars.putAll(staticVars);

        for (Map.Entry<String, Object> entry : allStackVars.entrySet()) {
            if (!firstStack) stackSb.append(",");
            firstStack = false;

            String varName = entry.getKey();
            Object val = entry.getValue();

            stackSb.append("\"").append(varName).append("\":");
            if (val == null) {
                stackSb.append("null");
            } else if (isPrimitiveWrapperOrString(val)) {
                stackSb.append("{\"type\":\"primitive\", \"value\":");
                appendJsonString(stackSb, String.valueOf(val));
                stackSb.append("}");
            } else {
                stackSb.append("{\"type\":\"ref\", \"ref\":").append(System.identityHashCode(val)).append("}");
                emitHeap(val, heapSb, seen, budget, firstHeap);
            }
        }
        stackSb.append("}");

        sb.append(",\"stack\":").append(stackSb);
        sb.append(",\"heap\":").append(heapSb).append("}");
        sb.append("}");
        System.out.println(MARKER + sb.toString());
        System.out.flush();
    }

    private static boolean isPrimitiveWrapperOrString(Object o) {
        return o instanceof String || o instanceof Number || o instanceof Boolean || o instanceof Character;
    }

    // Route a named child: primitives become displayed fields, everything else a pointer.
    private static void slot(String name, Object child, Map<String, String> fields, Map<String, Object> children) {
        if (child != null && isPrimitiveWrapperOrString(child)) {
            fields.put(name, String.valueOf(child));
        } else {
            children.put(name, child);
        }
    }

    private static void emitHeap(Object node, StringBuilder sb, IdentityHashMap<Object, Boolean> seen, int[] budget, boolean[] firstHeap) {
        if (node == null || isPrimitiveWrapperOrString(node)) return;
        if (seen.containsKey(node)) return;
        if (budget[0]-- <= 0) return;
        seen.put(node, Boolean.TRUE);

        int id = System.identityHashCode(node);
        Class<?> cls = node.getClass();

        LinkedHashMap<String, String> fields = new LinkedHashMap<>();
        LinkedHashMap<String, Object> children = new LinkedHashMap<>();
        String label;
        String type;

        if (cls.isArray()) {
            int len = Array.getLength(node);
            type = cls.getComponentType().getSimpleName() + "[]";
            label = "len=" + len;
            for (int i = 0; i < len && i < MAX_ENTRIES; i++) {
                slot("[" + i + "]", Array.get(node, i), fields, children);
            }
        } else if (node instanceof Collection) {
            Collection<?> col = (Collection<?>) node;
            type = cls.getSimpleName();
            label = "size=" + col.size();
            int i = 0;
            for (Object child : col) {
                if (i >= MAX_ENTRIES) break;
                slot("[" + i++ + "]", child, fields, children);
            }
        } else if (node instanceof Map) {
            Map<?, ?> map = (Map<?, ?>) node;
            type = cls.getSimpleName();
            label = "size=" + map.size();
            int i = 0;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (i >= MAX_ENTRIES) break;
                Object k = entry.getKey();
                Object v = entry.getValue();
                String valName;
                if (k == null || isPrimitiveWrapperOrString(k)) {
                    valName = String.valueOf(k);
                } else {
                    children.put("key" + i, k); // object key: show it as its own node
                    valName = "val" + i;
                }
                slot(valName, v, fields, children);
                i++;
            }
        } else {
            type = cls.getSimpleName();
            List<Field> primFields = new ArrayList<>();
            List<Field> refFields = new ArrayList<>();
            for (Class<?> c = cls; c != null && c != Object.class; c = c.getSuperclass()) {
                for (Field f : c.getDeclaredFields()) {
                    if (f.isSynthetic() || Modifier.isStatic(f.getModifiers())) continue;
                    try { f.setAccessible(true); } catch (Exception ex) { continue; }
                    Class<?> t = f.getType();
                    if (t.isPrimitive() || t == String.class || Number.class.isAssignableFrom(t) || t == Boolean.class || t == Character.class) {
                        primFields.add(f);
                    } else {
                        refFields.add(f);
                    }
                }
            }
            label = labelFor(node, primFields);
            for (Field f : primFields) {
                try { fields.put(f.getName(), String.valueOf(f.get(node))); } catch (Exception ignored) {}
            }
            for (Field f : refFields) {
                try { slot(f.getName(), f.get(node), fields, children); } catch (Exception ignored) {}
            }
        }

        StringBuilder nodeSb = new StringBuilder();
        nodeSb.append("\"").append(id).append("\":{");
        nodeSb.append("\"label\":");
        appendJsonString(nodeSb, label);
        nodeSb.append(",\"type\":");
        appendJsonString(nodeSb, type);

        nodeSb.append(",\"fields\":{");
        boolean first = true;
        for (Map.Entry<String, String> e : fields.entrySet()) {
            if (!first) nodeSb.append(",");
            first = false;
            appendJsonString(nodeSb, e.getKey());
            nodeSb.append(":");
            appendJsonString(nodeSb, e.getValue());
        }
        nodeSb.append("}");

        nodeSb.append(",\"pointers\":{");
        first = true;
        for (Map.Entry<String, Object> e : children.entrySet()) {
            if (!first) nodeSb.append(",");
            first = false;
            appendJsonString(nodeSb, e.getKey());
            nodeSb.append(":");
            if (e.getValue() == null) nodeSb.append("null");
            else nodeSb.append(System.identityHashCode(e.getValue()));
        }
        nodeSb.append("}}");

        if (!firstHeap[0]) sb.append(",");
        firstHeap[0] = false;
        sb.append(nodeSb);

        for (Object child : children.values()) {
            emitHeap(child, sb, seen, budget, firstHeap);
        }
    }

    private static String labelFor(Object node, List<Field> primFields) {
        try {
            for (String want : VALUE_NAMES) {
                for (Field f : primFields) {
                    if (f.getName().equalsIgnoreCase(want)) return String.valueOf(f.get(node));
                }
            }
            if (!primFields.isEmpty()) return String.valueOf(primFields.get(0).get(node));
        } catch (Exception ignored) { }
        return node.getClass().getSimpleName();
    }

    private static void appendJsonString(StringBuilder sb, String s) {
        if (s == null) {
            sb.append("null");
            return;
        }
        sb.append('"');
        escapeString(sb, s);
        sb.append('"');
    }

    private static void escapeString(StringBuilder sb, String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n");  break;
                case '\r': sb.append("\\r");  break;
                case '\t': sb.append("\\t");  break;
                default:
                    // Emit a backslash-u-XXXX escape built from separate chars. ECJ's batch
                    // scanner processes backslash-u unicode escapes in the raw stream (even
                    // inside strings and comments) and crashes when one is not followed by 4
                    // hex digits, so this source must never contain that two-char sequence.
                    if (c < 0x20) { sb.append('\\'); sb.append('u'); sb.append(String.format("%04x", (int) c)); }
                    else sb.append(c);
            }
        }
    }
}
