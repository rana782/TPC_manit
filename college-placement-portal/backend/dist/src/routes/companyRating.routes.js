"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const companyRating_controller_1 = require("../controllers/companyRating.controller");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyToken);
router.get('/', companyRating_controller_1.getCompanyRating);
exports.default = router;
