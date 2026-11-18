import {
  hospitalizationCreateSchema,
  hospitalizationUpdateSchema,
  inventoryCreateSchema,
  inventoryUpdateSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from '../../shared/schemas/index.ts';
import { requireAuth } from '../middleware/auth.ts';
import type { ClinicStore } from '../store/index.ts';
import {
  type ApiJsonResponse,
  type HttpRequest,
  getQueryParam,
  jsonError,
  jsonOk,
  parseBody,
} from '../core/http.ts';

export async function handleOperationsRoute(
  req: HttpRequest,
  subPath: string,
  store: ClinicStore
): Promise<ApiJsonResponse | null> {
  const cookieHeader = req.headers.cookie as string | undefined;

  // =========================================================================
  // TEAM TASKS
  // =========================================================================
  if (subPath === '/tasks' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    return jsonOk(await store.listTasks(auth.clinicId));
  }

  if (subPath === '/tasks' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store);
    const input = parseBody(taskCreateSchema, req.body);
    const created = await store.createTask(auth.clinicId, {
      ...input,
      createdBy: input.createdBy || auth.userName,
    });
    return jsonOk(created, 201);
  }

  const taskCommentsMatch = /^\/tasks\/([^/]+)\/comments$/.exec(subPath);
  if (taskCommentsMatch && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store);
    const text = String(req.body?.text || '').trim();
    if (!text) return jsonError(400, 'Le commentaire ne peut pas être vide.');
    const updated = await store.addTaskComment(auth.clinicId, decodeURIComponent(taskCommentsMatch[1]), {
      author: auth.userName,
      avatar: auth.session.user?.avatarInitials || 'MV',
      text,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    });
    if (!updated) return jsonError(404, 'Tâche introuvable');
    return jsonOk(updated);
  }

  const taskIdMatch = /^\/tasks\/([^/]+)$/.exec(subPath);
  if (taskIdMatch) {
    const id = decodeURIComponent(taskIdMatch[1]);
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const auth = await requireAuth(cookieHeader, store);
      const updates = parseBody(taskUpdateSchema, req.body);
      let updated = await store.updateTask(auth.clinicId, id, updates);
      if (!updated) return jsonError(404, 'Tâche introuvable');
      if (updates.commentText) {
        updated =
          (await store.addTaskComment(auth.clinicId, id, {
            author: auth.userName,
            avatar: auth.session.user?.avatarInitials || 'MV',
            text: updates.commentText,
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          })) || updated;
      }
      return jsonOk(updated);
    }
    if (req.method === 'DELETE') {
      const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian']);
      const ok = await store.deleteTask(auth.clinicId, id);
      if (!ok) return jsonError(404, 'Tâche introuvable');
      return jsonOk({ deleted: true });
    }
  }

  // =========================================================================
  // INVENTORY / STOCKS (Supports both /inventory and /stocks routes)
  // =========================================================================
  if ((subPath === '/inventory' || subPath === '/stocks') && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    return jsonOk(await store.listStocks(auth.clinicId));
  }

  if (subPath === '/inventory/movements' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    const itemId = getQueryParam(req, 'itemId');
    return jsonOk(await store.listInventoryMovements(auth.clinicId, itemId));
  }

  if ((subPath === '/inventory' || subPath === '/stocks') && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian', 'assistant']);
    const input = parseBody(inventoryCreateSchema, req.body);
    const created = await store.createStock(auth.clinicId, {
      ...input,
      performedBy: auth.userName,
    });
    return jsonOk(created, 201);
  }

  const invIdMatch = /^\/(?:inventory|stocks)\/([^/]+)$/.exec(subPath);
  if (invIdMatch && (req.method === 'PATCH' || req.method === 'PUT')) {
    const id = decodeURIComponent(invIdMatch[1]);
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian', 'assistant']);
    const updates = parseBody(inventoryUpdateSchema, req.body);
    const updated = await store.adjustStock(auth.clinicId, id, {
      ...updates,
      performedBy: auth.userName,
    });
    if (!updated) return jsonError(404, 'Article introuvable');
    return jsonOk(updated);
  }

  // =========================================================================
  // HOSPITALIZATIONS
  // =========================================================================
  if (subPath === '/hospitalizations' && req.method === 'GET') {
    const auth = await requireAuth(cookieHeader, store);
    return jsonOk(await store.listHospitalizations(auth.clinicId));
  }

  if (subPath === '/hospitalizations' && req.method === 'POST') {
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian', 'assistant']);
    const input = parseBody(hospitalizationCreateSchema, req.body);
    const created = await store.createHospitalization(auth.clinicId, input);
    return jsonOk(created, 201);
  }

  const hospIdMatch = /^\/hospitalizations\/([^/]+)$/.exec(subPath);
  if (hospIdMatch && (req.method === 'PATCH' || req.method === 'PUT')) {
    const id = decodeURIComponent(hospIdMatch[1]);
    const auth = await requireAuth(cookieHeader, store, ['super_admin', 'clinic_admin', 'veterinarian', 'assistant']);
    const updates = parseBody(hospitalizationUpdateSchema, req.body);
    const updated = await store.updateHospitalization(auth.clinicId, id, updates, auth.userName);
    if (!updated) return jsonError(404, 'Box d’hospitalisation introuvable');
    return jsonOk(updated);
  }

  return null;
}
